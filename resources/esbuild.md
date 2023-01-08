| option            | type    | default                                        | info                                                       |
| ----------------- | ------- | ---------------------------------------------- | ---------------------------------------------------------- |
| plugins           | array   |                                                |                                                            |
| external          | array   | ["aws-sdk", "esbuild"]                         | your custom external array will be merged into the default |
| sourcemap         | boolean | `true` if offline mode, `false` when deploying | overwrites the default value                               |
| minify            | boolean | `false` if offline mode, `true` when deploying | overwrites the default value                               |
| outdir            | string  | "./aws_lambda"                                 | overwrites the default value                               |
| outbase           | string  |                                                |                                                            |
| target            | string  | "ES2018"                                       |                                                            |
| tsconfig          | string  |                                                |                                                            |
| tsconfigRaw       | string  |                                                |                                                            |
| legalComments     | string  |                                                |                                                            |
| pure              | array   |                                                |                                                            |
| drop              | array   |                                                |                                                            |
| resolveExtensions | array   |                                                |                                                            |
| ignoreAnnotations | boolean |                                                |                                                            |
| treeShaking       | boolean |                                                |                                                            |
| define            | object  |                                                |                                                            |
| banner            | object  |                                                |                                                            |
| footer            | object  |                                                |                                                            |
| loader            | object  |                                                |                                                            |
| assetNames        | string  |                                                |                                                            |
| entryNames        | string  |                                                |                                                            |
| publicPath        | string  |                                                |                                                            |
| inject            | array   |                                                |                                                            |
| alias             | object  |                                                |                                                            |
