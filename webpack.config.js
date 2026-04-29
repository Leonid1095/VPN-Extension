const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
    const mode = argv && argv.mode === 'production' ? 'production' : 'development';
    const apiUrl =
        process.env.PLGAMES_API_URL || 'https://api.plgames-connect.example';

    return {
        mode,
        devtool: mode === 'production' ? false : 'cheap-module-source-map',
        entry: {
            background: './src/background/background.ts',
            popup: './src/popup/popup.tsx',
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js',
        },
        resolve: {
            extensions: ['.ts', '.tsx', '.js', '.jsx'],
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/,
                },
            ],
        },
        plugins: [
            new CleanWebpackPlugin(),
            new webpack.DefinePlugin({
                PLGAMES_API_URL: JSON.stringify(apiUrl),
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: path.resolve(__dirname, 'src/manifest.json'),
                        to: path.resolve(__dirname, 'dist'),
                    },
                    {
                        from: path.resolve(__dirname, 'src/assets'),
                        to: path.resolve(__dirname, 'dist/assets'),
                    },
                ],
            }),
            new HtmlWebpackPlugin({
                template: './src/popup/popup.html',
                filename: 'popup.html',
                chunks: ['popup'],
            }),
        ],
    };
};
