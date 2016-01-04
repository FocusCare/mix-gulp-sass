var gulp = require('gulp');
var gulpLog = require('gulp-log');
var sass = require('gulp-sass');
var postcss = require('gulp-postcss');
var env = require('../gulp/config/env');
var path = require('path');
var gulpMd5 = require('gulp-md5');
var autoprefixer = require('gulp-autoprefixer');
var rimraf = require('rimraf');
var glob = require('glob');
var fs = require('fs');
var minifyCss = require('gulp-minify-css');
var gutil = require('gulp-util');


var config;

if (gutil.env.env) {
    isProduction = gutil.env.env === 'production';
} else {
    isProduction = process.env.KDT_NODE_RUN_MODE == 'production';
}

var sassSrc = config.src;


// var sassSrc = ['sass/+(wap|wxd)/**/*.scss',
//     '!sass/+(wap|wxd)/**/_*',
//     '!sass/wap/projects/_showcase/_modules/*',
//     '!sass/wap/projects/_showcase/_homepage/*'
// ];
var sassIncludePaths = [path.join(__dirname, '../sass')];

gulp.task('clean:sass', function(cb) {
    return rimraf(path.join(__dirname, '../build_css/stylesheets/+(wap|wxd)/**/*'), cb);
});

gulp.task('build:sass', ['build:componentsCss'], function() {
    var processors = [imageUrl];
    var sassConfig = {
        includePaths: ['sass']
    };
    var dest = path.join(__dirname, '../local_css/stylesheets/');
    if (isProduction) {
        sassConfig.outputStyle = 'compressed';
        dest = path.join(__dirname, '../build_css/stylesheets/');
    }

    var stream = gulp.src(sassSrc, { cwd: '..' })
        .pipe(sass({
            includePaths: sassIncludePaths,
            outputStyle: 'compressed'
        }))
        .pipe(postcss(processors))
        .pipe(autoprefixer({
            browsers: ['ChromeAndroid > 1', 'iOS >= 4', 'ie > 6', 'ff > 4']
        }))

    if (isProduction) {
        stream = stream.pipe(gulpMd5());
    }

    stream.pipe(gulp.dest(dest))
        .pipe(gulpLog('编译完毕 --->'));

    return stream;
});

gulp.task('watch:sass', ['build:sass'], function() {
    gulp.watch(sassSrc, {
        cwd: '..'
    }, function(e) {
        var processors = [imageUrl];

        return gulp.src(e.path, { cwd: '..', base: path.join(__dirname, '../sass/') })
            .pipe(sass({
                includePaths: sassIncludePaths
            }))
            .pipe(postcss(processors))
            .pipe(autoprefixer({
                browsers: ['ChromeAndroid > 1', 'iOS >= 4', 'ie > 6', 'ff > 4']
            }))
            .pipe(gulp.dest(path.join(__dirname, '../local_css/stylesheets/')))
            .pipe(gulpLog('编译完毕 --->'));
    });
    gulp.watch(['sass/wap/**/_*.scss', 'sass/wxd/**/_*.scss'], function() {
        gulp.run('build:sass');
    });
});

gulp.task('build:componentsCss', isProduction ? ['clean:sass'] : [], function() {
    var srcPath = ['sass/wap/widget/sku_layout.scss'];
    var destPath = path.join(__dirname, '../components_css');

    return processSass(srcPath, destPath);
});

gulp.task('watch:componentsCss', function() {
    var srcPath = ['sass/wap/widget/sku_layout.scss'];
    var destPath = path.join(__dirname, '../components_css');

    gulp.watch(srcPath, function() {
        return processSass(srcPath, destPath);
    });
});

gulp.task('hash:css', function(cb) {
    glob(path.join(__dirname, '../build_css/stylesheets/+(wap|wxd)/**/*.css'), function(err, files) {
        if (err) {
            throw err;
        }
        printVersionMap(path.join(__dirname, '../../iron/resource/config/version_wap_css.php'), files);
        cb();
    });
})

function imageUrl(css) {
    var pattern = /image-url\("(.*)"\)(.*)/g;

    if (css.walkDecls && typeof css.walkDecls === 'function') {
        css.walkDecls(walker);
    } else {
        css.eachDecl(walker);
    }

    function walker(decl) {
        if (decl.value.indexOf('image-url') > -1) {
            decl.parent.replaceValues(pattern, function(string) {
                var arr = string.split(' ');
                var res = [];
                var tmp;

                for (var i = 0, len = arr.length; i < len; i++) {
                    tmp = arr[i];
                    tmp = tmp.replace(pattern, ' url("/v2/image/$1")$2');
                    res.push(tmp);
                }
                res = res.join(' ');
                return res;
            });
        }
    }
}

function printVersionMap(phpPath, array) {
    var str = '';
    var maps = [];
    var base = path.join(__dirname, '..');
    var checkSame = {};

    array.forEach(function(item) {
        var key;
        var value;

        value = path.relative(base, item);
        key = path.relative(path.join(base, 'build_css'), item);
        key = key.split('_');
        key.pop();
        key = key.join('_');

        if (checkSame[key]) {
            console.log(checkSame);
            throw new Error('same key => key: ' + key + '; value: ' + checkSame[key]);
        } else {
            checkSame[key] = value;
        }

        maps.push('"' + key + '" => "' + value + '"');
    });

    str += '<?php return array(\n';
    str += maps.join(',\n');
    str += '\n); ?>';

    console.log(phpPath);

    fs.writeFileSync(phpPath, str);

    console.log('hash写入 ' + path.join(__dirname, phpPath) + ' 成功');
    console.log('共 ' + maps.length + ' 个文件');
}

function processSass(srcPath, destPath) {
    var processors = [imageUrlForComponentCss];
    return gulp.src(srcPath, {cwd: '..'})
        // 编译Sass
        .pipe(sass({
            includePaths: sassIncludePaths
        }))
        .pipe(postcss(processors))
        // 自动添加CSS3的前缀
        .pipe(autoprefixer({
            browsers: ['ChromeAndroid > 1', 'iOS >= 4', 'ie > 6', 'ff > 4']
        }))
        .pipe(minifyCss())
        // .pipe(gulpMd5())
        .pipe(gulp.dest(destPath))
        .pipe(gulpLog('编译完毕 --->'));
}

function imageUrlForComponentCss(css) {
    var pattern = /image-url\("(.*)"\)(.*)/g;

    if (css.walkDecls && typeof css.walkDecls === 'function') {
        css.walkDecls(walker);
    } else {
        css.eachDecl(walker);
    }

    function walker(decl) {
        if (decl.value.indexOf('image-url') > -1) {
            decl.parent.replaceValues(pattern, function(string) {
                var arr = string.split(' ');
                var res = [];
                var tmp;
                for (var i = 0, len = arr.length; i < len; i++) {
                    tmp = arr[i];
                    // showcase css inline到html中后，css文件相对域名为wap.koudaitong.com，所以图片路径需要使用绝对路径
                    tmp = tmp.replace(pattern, 'url("https://su.yzcdn.cn/v2/image/$1")$2');
                    res.push(tmp);
                }
                res = res.join(' ');
                return res;
            });
        }
    }
}

// module.exports = function(config) {
//     config = config;
// }
