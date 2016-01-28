"use strict";
var PARALLEL = process.env.KDT_NODE_PARALLEL || 20;

var path = require('path');
var through2 = require('through2');
var colors = require('gulp-util').colors;
var log = require('gulp-util').log;
var fs = require('fs');
var Q = require('q');
var qiniu = require('node-qiniu');
var util = require('util');
var colors = require('colors');


module.exports = function(setting, option, deferred) {
    option = option || {};
    option = extend({
        dir: ''
    }, option);

    qiniu.config({
        access_key: setting.accessKey,
        secret_key: setting.secretKey
    });

    var bucket = qiniu.bucket(setting.bucket);

    var qs = [];
    var errorFiles = [];
    var filesNo = 0;

    function detective(file, fileKey) {
        var localHashDefer = Q.defer();
        var remoteHashDefer = Q.defer();

        getEtag(file.contents, function(hash) {
            localHashDefer.resolve(hash);
        });

        var assert = bucket.key(fileKey);

        assert.stat(function(err, stat) {
            if (err) {
                console.log(('\n七牛内部错误 → stat:' + JSON.stringify(err)).red);
                return remoteHashDefer.reject('network_error');
            }
            remoteHashDefer.resolve(stat.hash);
        });

        return Q.all([localHashDefer.promise, remoteHashDefer.promise])
            .then(function(result) {
                if (result[0] == undefined) {
                    return Q.reject('error');
                }
                if (result[1] == undefined) {
                    return Q.resolve('upload');
                }
                if (result[0] == result[1]) {
                    return Q.resolve('keep');
                } else {
                    return Q.reject('different');
                }
            });
    }

    function uploadFiles(files) {
        var failQs = []
        var qs = files.map(function(item) {
            return function() {
                return bucket.putFile(item.fileKey, item.file.path)
                    .then(function() {
                        log('上传七牛完毕', colors.green(item.file.path), '→', colors.green(item.fileKey));
                    }, function() {
                        failQs.push(item);
                        log('上传七牛失败', colors.red(item.file.path), '→', colors.red(item.fileKey));
                        console.log(('\n上传七牛失败 → ' + item.file.path).red);
                    });
            };
        });

        if (qs.length) {
            return throat(qs, PARALLEL)
                .then(function() {
                    if (failQs.length) {
                        console.log('开始重传', failQs.length, '个文件');
                        return uploadFiles(failQs);
                    }
                });
        } else {
            return [];
        }

    }

    var countKeep = 0;
    var countUpload = 0;
    return through2.obj(function(file, enc, next) {
        var that = this;
        if (file._contents === null) return next();

        var filePath = path.relative(file.base, file.path);
        var fileKey = option.dir + ((!option.dir || option.dir[option.dir.length - 1]) === '/' ? '' : '/') +
            filePath;

        qs.push(function() {
            return detective(file, fileKey)
                .then(function(action) {
                    if (action == 'upload') {
                        countUpload++;
                    } else {
                        countKeep++;
                    }
                    if (process.stdin.isTTY) {
                        process.stdout.clearLine();
                        process.stdout.cursorTo(0);
                        process.stdout.write('相同: ' + countKeep + '\t需要上传: ' + countUpload +
                            '\t错误:' + errorFiles.length);
                    }

                    if (action == 'upload') {
                        return {
                            file: file,
                            fileKey: fileKey
                        };
                    }
                })
                .fail(function(e) {
                    errorFiles.push({
                        fileKey: fileKey,
                        error: e
                    });
                });
        });

        next();
    }, function(next) {

        throat(qs, PARALLEL)
            .then(function(result) {
                if (process.stdin.isTTY) {
                    process.stdout.write('\n');
                }
                errorFiles.forEach(function(item) {
                    log(colors.red(item.error), item.fileKey);
                });
                result = result.filter(function(item) {
                    return item != undefined;
                });
                return uploadFiles(result);
            })
            .then(deferred && deferred.resolve)
            .fail(function(reason) {
                dumpError(reason);
            });
    });
}

function extend(target, source) {
    target = target || {};
    for (var prop in source) {
        if (typeof source[prop] === 'object') {
            target[prop] = extend(target[prop], source[prop]);
        } else {
            target[prop] = source[prop];
        }
    }
    return target;
}

function throat(qs, orgNum) {
    var point = orgNum - 1;
    var count = 0;
    var d = Q.defer();
    var result = [];

    qs.slice(0, point + 1).forEach(function(fn) {
        return fn().then(check, dumpError);
    });

    function check(r) {
        result.push(r);
        point++;
        count++;
        if (count == qs.length) {
            d.resolve(result);
            return;
        }
        if (point >= qs.length) {
            return;
        }
        var fn = qs[point];
        return fn().then(check);
    }
    return d.promise;
}

function getEtag(buffer, callback) {
    var mode = 'buffer';
    if (typeof buffer === 'string') {
        buffer = require('fs').createReadStream(buffer);
        mode = 'stream';
    } else if (buffer instanceof require('stream')) {
        mode = 'stream';
    }
    var sha1 = function(content) {
        var crypto = require('crypto');
        var sha1 = crypto.createHash('sha1');
        sha1.update(content);
        return sha1.digest();
    };
    var blockSize = 4 * 1024 * 1024;
    var sha1String = [];
    var prefix = 0x16;
    var blockCount = 0;
    switch (mode) {
        case 'buffer':
            var bufferSize = buffer.length;
            blockCount = Math.ceil(bufferSize / blockSize);
            for (var i = 0; i < blockCount; i++) {
                sha1String.push(sha1(buffer.slice(i * blockSize, (i + 1) * blockSize)));
            }
            process.nextTick(function() {
                callback(calcEtag());
            });
            break;
        case 'stream':
            var stream = buffer;
            stream.on('readable', function() {
                var chunk;
                while (chunk = stream.read(blockSize)) {
                    sha1String.push(sha1(chunk));
                    blockCount++;
                }
            });
            stream.on('end', function() {
                callback(calcEtag());
            });
            break;
    }

    function calcEtag() {
        if (!sha1String.length) {
            return 'Fto5o-5ea0sNMlW_75VgGJCv2AcJ';
        }
        var sha1Buffer = Buffer.concat(sha1String, blockCount * 20);
        if (blockCount > 1) {
            prefix = 0x96;
            sha1Buffer = sha1(sha1Buffer);
        }
        sha1Buffer = Buffer.concat(
            [new Buffer([prefix]), sha1Buffer],
            sha1Buffer.length + 1
        );
        return sha1Buffer.toString('base64')
            .replace(/\//g, '_').replace(/\+/g, '-');
    }
}

function dumpError(err) {
    console.log(('\n七牛内部错误 → ' + JSON.stringify(err)).red);
    if (typeof err === 'object') {
        if (err.message) {
            console.error('\nMessage: ' + err.message)
        }
        if (err.stack) {
            console.error('\nStacktrace:')
            console.error('====================')
            console.error(err.stack);
        }
    } else {
        console.error('dumpError :: argument is not an object');
    }
}
