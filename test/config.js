module.exports = {
    includePaths: 'sass',
    src: 'sass/*.scss',
    excludeSrc: 'sass/_*',
    devDest: 'local_css',
    prodDest: 'build_css',
    cleanSrc: 'build_css/**/*.css',
    version: {
        base: 'build_css',
        src: 'build_css/*.css',
        dest: 'version/v.php'
    },
    componentsSass: {
        src: 'sass/components_css/com.scss',
        dest: 'components_css'
    } 
}