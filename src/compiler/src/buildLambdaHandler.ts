import ts from "typescript";
import { ILambdaCompiler } from "./declarations";
const cantFindPath = (method = "access", path = "/") => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot ${method} ${path}</pre>
</body>
</html>`;

const InternalServerError = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Internal Server Error</pre>
</body>
</html>`;

const buildControllers = (context: ts.TransformationContext, lambdaName: string, middlewares: ts.Expression[]) => {
  return context.factory.createVariableStatement(
    undefined,
    context.factory.createVariableDeclarationList(
      [
        context.factory.createVariableDeclaration(
          context.factory.createIdentifier(`_${lambdaName}Middlewares`),
          undefined,
          context.factory.createArrayTypeNode(context.factory.createTypeReferenceNode(context.factory.createIdentifier("RouteController"), undefined)),
          context.factory.createArrayLiteralExpression(middlewares, false)
        ),
      ],
      ts.NodeFlags.Const
    )
  );
};

const buildRequestEvent = (context: ts.TransformationContext) => {
  return context.factory.createVariableStatement(
    undefined,
    context.factory.createVariableDeclarationList(
      [
        context.factory.createVariableDeclaration(
          context.factory.createIdentifier("req"),
          undefined,
          undefined,
          context.factory.createCallExpression(context.factory.createIdentifier("_buildUniversalEvent"), undefined, [context.factory.createIdentifier("event")])
        ),
      ],
      ts.NodeFlags.Const | ts.NodeFlags.AwaitContext | ts.NodeFlags.ContextFlags | ts.NodeFlags.TypeExcludesFlags
    )
  );
};

const buildResponseHandler = (context: ts.TransformationContext) => {
  return context.factory.createVariableStatement(
    undefined,
    context.factory.createVariableDeclarationList(
      [
        context.factory.createVariableDeclaration(
          context.factory.createIdentifier("res"),
          undefined,
          undefined,
          context.factory.createNewExpression(context.factory.createIdentifier("_ResponseHandler"), undefined, [
            context.factory.createObjectLiteralExpression(
              [
                context.factory.createSpreadAssignment(context.factory.createIdentifier("context")),
                context.factory.createShorthandPropertyAssignment(context.factory.createIdentifier("resolve2"), undefined),
              ],
              false
            ),
          ])
        ),
      ],
      ts.NodeFlags.Const
    )
  );
};

const buildFakeResolver = (context: ts.TransformationContext) => {
  return [
    context.factory.createVariableStatement(
      undefined,
      context.factory.createVariableDeclarationList(
        [context.factory.createVariableDeclaration(context.factory.createIdentifier("content"), undefined, undefined, context.factory.createNull())],
        ts.NodeFlags.Let
      )
    ),
    context.factory.createFunctionDeclaration(
      undefined,
      undefined,
      context.factory.createIdentifier("resolve2"),
      undefined,
      [context.factory.createParameterDeclaration(undefined, undefined, context.factory.createIdentifier("cc"), undefined, undefined, undefined)],
      undefined,
      context.factory.createBlock(
        [
          context.factory.createExpressionStatement(
            context.factory.createBinaryExpression(
              context.factory.createIdentifier("content"),
              context.factory.createToken(ts.SyntaxKind.EqualsToken),
              context.factory.createIdentifier("cc")
            )
          ),
        ],
        true
      )
    ),
  ];
};

const buildLambdaEntryPoint = (context: ts.TransformationContext, lambdaName: string) => {
  return context.factory.createFunctionDeclaration(
    undefined,
    [context.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
    undefined,
    context.factory.createIdentifier(lambdaName),
    undefined,
    [
      context.factory.createParameterDeclaration(undefined, undefined, undefined, context.factory.createIdentifier("event"), undefined, undefined, undefined),
      context.factory.createParameterDeclaration(undefined, undefined, undefined, context.factory.createIdentifier("context"), undefined, undefined, undefined),
    ],
    undefined,
    context.factory.createBlock(
      [
        context.factory.createVariableStatement(
          undefined,
          context.factory.createVariableDeclarationList(
            [
              context.factory.createVariableDeclaration(
                context.factory.createIdentifier("response"),
                undefined,
                undefined,
                context.factory.createAwaitExpression(
                  context.factory.createCallExpression(context.factory.createIdentifier(`_${lambdaName}Delegate`), undefined, [
                    context.factory.createIdentifier("event"),
                    context.factory.createIdentifier("context"),
                  ])
                )
              ),
            ],
            ts.NodeFlags.Const | ts.NodeFlags.AwaitContext | ts.NodeFlags.ContextFlags | ts.NodeFlags.TypeExcludesFlags
          )
        ),
        context.factory.createReturnStatement(context.factory.createIdentifier("response")),
      ],
      true
    )
  );
};

export const buildLambdaHandler = (context: ts.TransformationContext, lambdaName: string, middlewares: ts.Expression[], compiler: ILambdaCompiler) => {
  return [
    buildControllers(context, lambdaName, middlewares),
    // DELEGATE
    context.factory.createFunctionDeclaration(
      undefined,
      undefined,
      undefined,
      context.factory.createIdentifier(`_${lambdaName}Delegate`),
      undefined,
      [
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          undefined,
          context.factory.createIdentifier("event"),
          undefined,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
          undefined
        ),
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          undefined,
          context.factory.createIdentifier("context"),
          undefined,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
          undefined
        ),
      ],
      undefined,
      context.factory.createBlock(
        [
          context.factory.createReturnStatement(
            context.factory.createNewExpression(context.factory.createIdentifier("Promise"), undefined, [
              context.factory.createArrowFunction(
                [context.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
                undefined,
                [
                  context.factory.createParameterDeclaration(undefined, undefined, undefined, context.factory.createIdentifier("resolve"), undefined, undefined, undefined),
                  context.factory.createParameterDeclaration(undefined, undefined, undefined, context.factory.createIdentifier("reject"), undefined, undefined, undefined),
                ],
                undefined,
                context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                context.factory.createBlock(
                  [
                    buildRequestEvent(context),
                    ...buildFakeResolver(context),
                    buildResponseHandler(context),
                    context.factory.createVariableStatement(
                      undefined,
                      context.factory.createVariableDeclarationList(
                        [context.factory.createVariableDeclaration(context.factory.createIdentifier("generatorObject"), undefined, undefined, undefined)],
                        ts.NodeFlags.Let | ts.NodeFlags.AwaitContext | ts.NodeFlags.ContextFlags | ts.NodeFlags.TypeExcludesFlags
                      )
                    ),

                    context.factory.createVariableStatement(
                      undefined,
                      context.factory.createVariableDeclarationList(
                        [
                          context.factory.createVariableDeclaration(
                            context.factory.createIdentifier("hasErrorHandler"),
                            undefined,
                            undefined,
                            context.factory.createBinaryExpression(
                              context.factory.createTypeOfExpression(context.factory.createIdentifier("_routeerrorCallback")),
                              context.factory.createToken(ts.SyntaxKind.ExclamationEqualsToken),
                              context.factory.createStringLiteral("undefined")
                            )
                          ),
                        ],
                        ts.NodeFlags.Const
                      )
                    ),
                    context.factory.createVariableStatement(
                      undefined,
                      context.factory.createVariableDeclarationList(
                        [context.factory.createVariableDeclaration(context.factory.createIdentifier("erroIsCalled"), undefined, undefined, context.factory.createFalse())],
                        ts.NodeFlags.Let
                      )
                    ),
                    context.factory.createFunctionDeclaration(
                      [context.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
                      undefined,
                      context.factory.createIdentifier("next"),
                      undefined,
                      [context.factory.createParameterDeclaration(undefined, undefined, context.factory.createIdentifier("err"), undefined, undefined, undefined)],
                      undefined,
                      context.factory.createBlock(
                        [
                          context.factory.createIfStatement(
                            context.factory.createIdentifier("err"),
                            context.factory.createBlock(
                              [
                                context.factory.createIfStatement(
                                  context.factory.createIdentifier("hasErrorHandler"),
                                  context.factory.createBlock(
                                    [
                                      context.factory.createTryStatement(
                                        context.factory.createBlock(
                                          [
                                            context.factory.createExpressionStatement(
                                              context.factory.createAwaitExpression(
                                                context.factory.createCallExpression(context.factory.createIdentifier(`_${lambdaName}errorCallback`), undefined, [
                                                  context.factory.createIdentifier("err"),
                                                  context.factory.createIdentifier("req"),
                                                  context.factory.createIdentifier("res"),
                                                ])
                                              )
                                            ),
                                          ],
                                          true
                                        ),
                                        context.factory.createCatchClause(
                                          context.factory.createVariableDeclaration(context.factory.createIdentifier("error"), undefined, undefined, undefined),
                                          context.factory.createBlock(
                                            [
                                              context.factory.createExpressionStatement(
                                                context.factory.createCallExpression(
                                                  context.factory.createPropertyAccessExpression(
                                                    context.factory.createCallExpression(
                                                      context.factory.createPropertyAccessExpression(
                                                        context.factory.createCallExpression(
                                                          context.factory.createPropertyAccessExpression(
                                                            context.factory.createIdentifier("res"),
                                                            context.factory.createIdentifier("status")
                                                          ),
                                                          undefined,
                                                          [context.factory.createNumericLiteral("500")]
                                                        ),
                                                        context.factory.createIdentifier("type")
                                                      ),
                                                      undefined,
                                                      [context.factory.createStringLiteral("text/html; charset=utf-8")]
                                                    ),
                                                    context.factory.createIdentifier("send")
                                                  ),
                                                  undefined,
                                                  [
                                                    context.factory.createPropertyAccessExpression(
                                                      context.factory.createIdentifier("error"),
                                                      context.factory.createIdentifier("message")
                                                    ),
                                                  ]
                                                )
                                              ),
                                            ],
                                            true
                                          )
                                        ),
                                        undefined
                                      ),
                                    ],
                                    true
                                  ),
                                  context.factory.createBlock(
                                    [
                                      context.factory.createExpressionStatement(
                                        context.factory.createCallExpression(
                                          context.factory.createPropertyAccessExpression(
                                            context.factory.createCallExpression(
                                              context.factory.createPropertyAccessExpression(
                                                context.factory.createCallExpression(
                                                  context.factory.createPropertyAccessExpression(
                                                    context.factory.createIdentifier("res"),
                                                    context.factory.createIdentifier("status")
                                                  ),
                                                  undefined,
                                                  [context.factory.createNumericLiteral("500")]
                                                ),
                                                context.factory.createIdentifier("type")
                                              ),
                                              undefined,
                                              [context.factory.createStringLiteral("text/html; charset=utf-8")]
                                            ),
                                            context.factory.createIdentifier("send")
                                          ),
                                          undefined,
                                          [context.factory.createPropertyAccessExpression(context.factory.createIdentifier("err"), context.factory.createIdentifier("message"))]
                                        )
                                      ),
                                    ],
                                    true
                                  )
                                ),
                                context.factory.createExpressionStatement(
                                  context.factory.createBinaryExpression(
                                    context.factory.createIdentifier("erroIsCalled"),
                                    context.factory.createToken(ts.SyntaxKind.EqualsToken),
                                    context.factory.createTrue()
                                  )
                                ),
                              ],
                              true
                            ),
                            context.factory.createBlock(
                              [
                                context.factory.createExpressionStatement(
                                  context.factory.createAwaitExpression(
                                    context.factory.createCallExpression(
                                      context.factory.createPropertyAccessExpression(context.factory.createIdentifier("generatorObject"), context.factory.createIdentifier("next")),
                                      undefined,
                                      []
                                    )
                                  )
                                ),
                              ],
                              true
                            )
                          ),
                        ],
                        true
                      )
                    ),
                    context.factory.createFunctionDeclaration(
                      [context.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
                      context.factory.createToken(ts.SyntaxKind.AsteriskToken),
                      context.factory.createIdentifier("handler"),
                      undefined,
                      [context.factory.createParameterDeclaration(undefined, undefined, context.factory.createIdentifier("func"), undefined, undefined, undefined)],
                      undefined,
                      context.factory.createBlock(
                        [
                          context.factory.createVariableStatement(
                            undefined,
                            context.factory.createVariableDeclarationList(
                              [context.factory.createVariableDeclaration(context.factory.createIdentifier("callNext"), undefined, undefined, context.factory.createTrue())],
                              ts.NodeFlags.Let | ts.NodeFlags.YieldContext | ts.NodeFlags.AwaitContext | ts.NodeFlags.ContextFlags | ts.NodeFlags.TypeExcludesFlags
                            )
                          ),
                          context.factory.createVariableStatement(
                            undefined,
                            context.factory.createVariableDeclarationList(
                              [
                                context.factory.createVariableDeclaration(
                                  context.factory.createIdentifier("nextWrapper"),
                                  undefined,
                                  undefined,
                                  context.factory.createArrowFunction(
                                    undefined,
                                    undefined,
                                    [context.factory.createParameterDeclaration(undefined, undefined, context.factory.createIdentifier("err"), undefined, undefined, undefined)],
                                    undefined,
                                    context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                                    context.factory.createBlock(
                                      [
                                        context.factory.createExpressionStatement(
                                          context.factory.createBinaryExpression(
                                            context.factory.createIdentifier("callNext"),
                                            context.factory.createToken(ts.SyntaxKind.EqualsToken),
                                            context.factory.createFalse()
                                          )
                                        ),
                                        context.factory.createExpressionStatement(
                                          context.factory.createCallExpression(context.factory.createIdentifier("next"), undefined, [context.factory.createIdentifier("err")])
                                        ),
                                      ],
                                      true
                                    )
                                  )
                                ),
                              ],
                              ts.NodeFlags.Const | ts.NodeFlags.YieldContext | ts.NodeFlags.AwaitContext | ts.NodeFlags.ContextFlags | ts.NodeFlags.TypeExcludesFlags
                            )
                          ),
                          context.factory.createExpressionStatement(
                            context.factory.createAwaitExpression(
                              context.factory.createCallExpression(context.factory.createIdentifier("func"), undefined, [
                                context.factory.createIdentifier("req"),
                                context.factory.createIdentifier("res"),
                                context.factory.createIdentifier("nextWrapper"),
                              ])
                            )
                          ),
                          context.factory.createReturnStatement(context.factory.createIdentifier("callNext")),
                        ],
                        true
                      )
                    ),

                    context.factory.createFunctionDeclaration(
                      undefined,
                      [context.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
                      context.factory.createToken(ts.SyntaxKind.AsteriskToken),
                      context.factory.createIdentifier("generatorFunction"),
                      undefined,
                      [],
                      undefined,
                      context.factory.createBlock(
                        [
                          context.factory.createForOfStatement(
                            undefined,
                            context.factory.createVariableDeclarationList(
                              [context.factory.createVariableDeclaration(context.factory.createIdentifier("func"), undefined, undefined, undefined)],
                              ts.NodeFlags.Const | ts.NodeFlags.YieldContext | ts.NodeFlags.AwaitContext | ts.NodeFlags.ContextFlags | ts.NodeFlags.TypeExcludesFlags
                            ),
                            context.factory.createIdentifier(`_${lambdaName}Middlewares`),
                            context.factory.createBlock(
                              [
                                context.factory.createIfStatement(
                                  context.factory.createBinaryExpression(
                                    context.factory.createIdentifier("erroIsCalled"),
                                    context.factory.createToken(ts.SyntaxKind.BarBarToken),
                                    context.factory.createIdentifier("content")
                                  ),
                                  context.factory.createBlock([context.factory.createBreakStatement(undefined)], true),
                                  undefined
                                ),
                                context.factory.createTryStatement(
                                  context.factory.createBlock(
                                    [
                                      context.factory.createVariableStatement(
                                        undefined,
                                        context.factory.createVariableDeclarationList(
                                          [
                                            context.factory.createVariableDeclaration(
                                              context.factory.createIdentifier("shouldBreak"),
                                              undefined,
                                              undefined,
                                              context.factory.createBinaryExpression(
                                                context.factory.createIdentifier("yield"),
                                                context.factory.createToken(ts.SyntaxKind.AsteriskToken),
                                                context.factory.createAwaitExpression(
                                                  context.factory.createCallExpression(context.factory.createIdentifier("handler"), undefined, [
                                                    context.factory.createIdentifier("func"),
                                                  ])
                                                )
                                              )
                                            ),
                                          ],
                                          ts.NodeFlags.Const
                                        )
                                      ),
                                      context.factory.createIfStatement(
                                        context.factory.createIdentifier("shouldBreak"),
                                        context.factory.createBlock([context.factory.createBreakStatement(undefined)], true),
                                        undefined
                                      ),
                                    ],
                                    true
                                  ),
                                  context.factory.createCatchClause(
                                    context.factory.createVariableDeclaration(context.factory.createIdentifier("error"), undefined, undefined, undefined),
                                    context.factory.createBlock(
                                      [
                                        context.factory.createIfStatement(
                                          context.factory.createIdentifier("hasErrorHandler"),
                                          context.factory.createBlock(
                                            [
                                              context.factory.createTryStatement(
                                                context.factory.createBlock(
                                                  [
                                                    context.factory.createExpressionStatement(
                                                      context.factory.createAwaitExpression(
                                                        context.factory.createCallExpression(context.factory.createIdentifier(`_${lambdaName}errorCallback`), undefined, [
                                                          context.factory.createIdentifier("error"),
                                                          context.factory.createIdentifier("req"),
                                                          context.factory.createIdentifier("res"),
                                                        ])
                                                      )
                                                    ),
                                                  ],
                                                  true
                                                ),
                                                context.factory.createCatchClause(
                                                  context.factory.createVariableDeclaration(context.factory.createIdentifier("error"), undefined, undefined, undefined),
                                                  context.factory.createBlock(
                                                    [
                                                      context.factory.createExpressionStatement(
                                                        context.factory.createCallExpression(
                                                          context.factory.createPropertyAccessExpression(
                                                            context.factory.createCallExpression(
                                                              context.factory.createPropertyAccessExpression(
                                                                context.factory.createCallExpression(
                                                                  context.factory.createPropertyAccessExpression(
                                                                    context.factory.createIdentifier("res"),
                                                                    context.factory.createIdentifier("status")
                                                                  ),
                                                                  undefined,
                                                                  [context.factory.createNumericLiteral("500")]
                                                                ),
                                                                context.factory.createIdentifier("type")
                                                              ),
                                                              undefined,
                                                              [context.factory.createStringLiteral("text/html; charset=utf-8")]
                                                            ),
                                                            context.factory.createIdentifier("send")
                                                          ),
                                                          undefined,
                                                          [
                                                            compiler.isDev
                                                              ? context.factory.createIdentifier("error.message")
                                                              : context.factory.createStringLiteral(InternalServerError),
                                                          ]
                                                        )
                                                      ),
                                                    ],
                                                    true
                                                  )
                                                ),
                                                undefined
                                              ),
                                            ],
                                            true
                                          ),
                                          context.factory.createBlock(
                                            [
                                              context.factory.createExpressionStatement(
                                                context.factory.createCallExpression(
                                                  context.factory.createPropertyAccessExpression(
                                                    context.factory.createCallExpression(
                                                      context.factory.createPropertyAccessExpression(
                                                        context.factory.createCallExpression(
                                                          context.factory.createPropertyAccessExpression(
                                                            context.factory.createIdentifier("res"),
                                                            context.factory.createIdentifier("status")
                                                          ),
                                                          undefined,
                                                          [context.factory.createNumericLiteral("500")]
                                                        ),
                                                        context.factory.createIdentifier("type")
                                                      ),
                                                      undefined,
                                                      [context.factory.createStringLiteral("text/html; charset=utf-8")]
                                                    ),
                                                    context.factory.createIdentifier("send")
                                                  ),
                                                  undefined,
                                                  [compiler.isDev ? context.factory.createIdentifier("error.message") : context.factory.createStringLiteral(InternalServerError)]
                                                )
                                              ),
                                            ],
                                            true
                                          )
                                        ),
                                        context.factory.createExpressionStatement(
                                          context.factory.createBinaryExpression(
                                            context.factory.createIdentifier("erroIsCalled"),
                                            context.factory.createToken(ts.SyntaxKind.EqualsToken),
                                            context.factory.createTrue()
                                          )
                                        ),
                                      ],
                                      true
                                    )
                                  ),
                                  undefined
                                ),
                              ],
                              true
                            )
                          ),
                        ],
                        true
                      )
                    ),
                    context.factory.createExpressionStatement(
                      context.factory.createBinaryExpression(
                        context.factory.createIdentifier("generatorObject"),
                        context.factory.createToken(ts.SyntaxKind.EqualsToken),
                        context.factory.createCallExpression(
                          context.factory.createPropertyAccessExpression(context.factory.createIdentifier("generatorFunction"), context.factory.createIdentifier("call")),
                          undefined,
                          [context.factory.createThis()]
                        )
                      )
                    ),
                    context.factory.createExpressionStatement(
                      context.factory.createAwaitExpression(
                        context.factory.createCallExpression(
                          context.factory.createPropertyAccessExpression(context.factory.createIdentifier("generatorObject"), context.factory.createIdentifier("next")),
                          undefined,
                          []
                        )
                      )
                    ),
                    context.factory.createIfStatement(
                      context.factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken, context.factory.createIdentifier("content")),
                      context.factory.createBlock(
                        [
                          context.factory.createExpressionStatement(
                            context.factory.createBinaryExpression(
                              context.factory.createIdentifier("content"),
                              context.factory.createToken(ts.SyntaxKind.EqualsToken),
                              context.factory.createObjectLiteralExpression(
                                [context.factory.createPropertyAssignment(context.factory.createIdentifier("statusCode"), context.factory.createNumericLiteral("204"))],
                                true
                              )
                            )
                          ),
                        ],
                        true
                      ),
                      undefined
                    ),

                    // context.factory.createIfStatement(
                    //   context.factory.createPrefixUnaryExpression(
                    //     ts.SyntaxKind.ExclamationToken,
                    //     context.factory.createPropertyAccessExpression(context.factory.createIdentifier("res"), context.factory.createIdentifier("isSent"))
                    //   ),
                    //   context.factory.createBlock(
                    //     [
                    //       context.factory.createExpressionStatement(
                    //         context.factory.createAwaitExpression(
                    //           context.factory.createCallExpression(
                    //             context.factory.createPropertyAccessExpression(context.factory.createIdentifier("generatorObject"), context.factory.createIdentifier("next")),
                    //             undefined,
                    //             []
                    //           )
                    //         )
                    //       ),
                    //       context.factory.createExpressionStatement(
                    //         context.factory.createCallExpression(
                    //           context.factory.createPropertyAccessExpression(
                    //             context.factory.createCallExpression(
                    //               context.factory.createPropertyAccessExpression(
                    //                 context.factory.createCallExpression(
                    //                   context.factory.createPropertyAccessExpression(context.factory.createIdentifier("res"), context.factory.createIdentifier("status")),
                    //                   undefined,
                    //                   [context.factory.createNumericLiteral("404")]
                    //                 ),
                    //                 context.factory.createIdentifier("type")
                    //               ),
                    //               undefined,
                    //               [context.factory.createStringLiteral("text/html; charset=utf-8")]
                    //             ),
                    //             context.factory.createIdentifier("send")
                    //           ),
                    //           undefined,
                    //           [context.factory.createStringLiteral(cantFindPath("access", lambdaName))]
                    //         )
                    //       ),
                    //     ],
                    //     true
                    //   ),
                    //   undefined
                    // ),
                    context.factory.createExpressionStatement(
                      context.factory.createCallExpression(context.factory.createIdentifier("resolve"), undefined, [context.factory.createIdentifier("content")])
                    ),
                  ],
                  true
                )
              ),
            ])
          ),
        ],
        true
      )
    ),

    buildLambdaEntryPoint(context, lambdaName),
  ];
};
