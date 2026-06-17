import path from "path";
import { fileURLToPath } from "url";
import { glob } from "glob";
import CopyPlugin from "copy-webpack-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scenarioFiles = glob.sync("./scenarios/**/*.js");

const entries = {};
scenarioFiles.forEach((file) => {
  const name = file
    .replace("./scenarios/", "")
    .replace(".js", "");
  entries[name] = file;
});

export default {
  mode: "production",
  entry: entries,
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].bundle.js",
    library: {
      type: "module",
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
        test: /\.js$/,
        exclude: /node_modules/,
        type: "javascript/esm",
      },
    ],
  },
  resolve: {
    extensions: [".js"],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: "config",
          to: "config",
        },
      ],
    }),
  ],
  optimization: {
    minimize: false,
    moduleIds: "named",
    chunkIds: "named",
  },
  target: "web",
  devtool: false,
  stats: {
    colors: true,
    modules: false,
    children: false,
  },
};
