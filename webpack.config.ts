import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import CopyPlugin from 'copy-webpack-plugin';
import type { Configuration } from 'webpack';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find all TypeScript scenario files
const scenarioFiles = glob.sync('./scenarios/**/*.ts');

const entries: Record<string, string> = {};
scenarioFiles.forEach((file) => {
  const name = file
    .replace('./scenarios/', '')
    .replace('.ts', '');
  // Ensure paths are relative with ./
  entries[name] = file.startsWith('./') ? file : `./${file}`;
});

const config: Configuration = {
  mode: 'production',
  entry: entries,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
    library: {
      type: 'module',
    },
    clean: true,
  },
  experiments: {
    outputModule: true,
  },
  externals: [
    /^k6(\/.*)?$/,
  ],
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: {
              module: 'ES2020',
              moduleResolution: 'bundler',
            },
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@lib': path.resolve(__dirname, 'lib'),
      '@operations': path.resolve(__dirname, 'operations'),
      '@helpers': path.resolve(__dirname, 'helpers'),
      '@types': path.resolve(__dirname, 'types'),
    },
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'config',
          to: 'config',
        },
      ],
    }),
  ],
  optimization: {
    minimize: false,
    moduleIds: 'named',
    chunkIds: 'named',
  },
  target: 'web',
  devtool: false,
  stats: {
    colors: true,
    modules: false,
    children: false,
  },
};

export default config;
