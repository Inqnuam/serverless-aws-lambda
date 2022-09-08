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

export const buildLambdaHandler = (context: ts.TransformationContext, lambdaName: string, middlewares: ts.Expression[], compiler: ILambdaCompiler) => {
  return [
    // route middlewares
    context.factory.createVariableStatement(
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
    ),
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
                    context.factory.createVariableStatement(
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
                    ),
                    context.factory.createVariableStatement(
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
                                  context.factory.createShorthandPropertyAssignment(context.factory.createIdentifier("resolve"), undefined),
                                ],
                                false
                              ),
                            ])
                          ),
                        ],
                        ts.NodeFlags.Const | ts.NodeFlags.AwaitContext | ts.NodeFlags.ContextFlags | ts.NodeFlags.TypeExcludesFlags
                      )
                    ),
                    context.factory.createVariableStatement(
                      undefined,
                      context.factory.createVariableDeclarationList(
                        [context.factory.createVariableDeclaration(context.factory.createIdentifier("generatorObject"), undefined, undefined, undefined)],
                        ts.NodeFlags.Let | ts.NodeFlags.AwaitContext | ts.NodeFlags.ContextFlags | ts.NodeFlags.TypeExcludesFlags
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
                              [context.factory.createVariableDeclaration(context.factory.createIdentifier("handler"), undefined, undefined, undefined)],
                              ts.NodeFlags.Const | ts.NodeFlags.YieldContext | ts.NodeFlags.AwaitContext | ts.NodeFlags.ContextFlags | ts.NodeFlags.TypeExcludesFlags
                            ),
                            context.factory.createIdentifier(`_${lambdaName}Middlewares`),
                            context.factory.createBlock(
                              [
                                context.factory.createIfStatement(
                                  context.factory.createPropertyAccessExpression(context.factory.createIdentifier("res"), context.factory.createIdentifier("isSent")),
                                  context.factory.createBlock([context.factory.createBreakStatement(undefined)], true),
                                  undefined
                                ),

                                context.factory.createTryStatement(
                                  context.factory.createBlock(
                                    [
                                      context.factory.createExpressionStatement(
                                        context.factory.createYieldExpression(
                                          undefined,
                                          context.factory.createAwaitExpression(
                                            context.factory.createCallExpression(context.factory.createIdentifier("handler"), undefined, [
                                              context.factory.createIdentifier("req"),
                                              context.factory.createIdentifier("res"),
                                              context.factory.createArrowFunction(
                                                [context.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
                                                undefined,
                                                [
                                                  context.factory.createParameterDeclaration(
                                                    undefined,
                                                    undefined,
                                                    undefined,
                                                    context.factory.createIdentifier("err"),
                                                    undefined,
                                                    undefined,
                                                    undefined
                                                  ),
                                                ],
                                                undefined,
                                                context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                                                context.factory.createBlock(
                                                  [
                                                    context.factory.createIfStatement(
                                                      context.factory.createIdentifier("err"),
                                                      context.factory.createBlock(
                                                        [
                                                          context.factory.createIfStatement(
                                                            context.factory.createBinaryExpression(
                                                              context.factory.createTypeOfExpression(context.factory.createIdentifier(`_${lambdaName}errorCallback`)),
                                                              context.factory.createToken(ts.SyntaxKind.ExclamationEqualsToken),
                                                              context.factory.createStringLiteral("undefined")
                                                            ),
                                                            context.factory.createBlock(
                                                              [
                                                                context.factory.createTryStatement(
                                                                  context.factory.createBlock(
                                                                    [
                                                                      context.factory.createExpressionStatement(
                                                                        context.factory.createAwaitExpression(
                                                                          context.factory.createCallExpression(
                                                                            context.factory.createIdentifier(`_${lambdaName}errorCallback`),
                                                                            undefined,
                                                                            [
                                                                              context.factory.createIdentifier("err"),
                                                                              context.factory.createIdentifier("req"),
                                                                              context.factory.createIdentifier("res"),
                                                                            ]
                                                                          )
                                                                        )
                                                                      ),
                                                                    ],
                                                                    true
                                                                  ),
                                                                  context.factory.createCatchClause(
                                                                    context.factory.createVariableDeclaration(
                                                                      context.factory.createIdentifier("error"),
                                                                      undefined,
                                                                      undefined,
                                                                      undefined
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
                                                                    [
                                                                      compiler.isDev
                                                                        ? context.factory.createIdentifier("err.message")
                                                                        : context.factory.createStringLiteral(InternalServerError),
                                                                    ]
                                                                  )
                                                                ),
                                                              ],
                                                              true
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
                                                                context.factory.createPropertyAccessExpression(
                                                                  context.factory.createIdentifier("generatorObject"),
                                                                  context.factory.createIdentifier("next")
                                                                ),
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
                                            ])
                                          )
                                        )
                                      ),
                                    ],
                                    true
                                  ),
                                  context.factory.createCatchClause(
                                    context.factory.createVariableDeclaration(context.factory.createIdentifier("error"), undefined, undefined, undefined),
                                    context.factory.createBlock(
                                      [
                                        context.factory.createIfStatement(
                                          context.factory.createBinaryExpression(
                                            context.factory.createTypeOfExpression(context.factory.createIdentifier(`_${lambdaName}errorCallback`)),
                                            context.factory.createToken(ts.SyntaxKind.ExclamationEqualsToken),
                                            context.factory.createStringLiteral("undefined")
                                          ),
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
                      context.factory.createPrefixUnaryExpression(
                        ts.SyntaxKind.ExclamationToken,
                        context.factory.createPropertyAccessExpression(context.factory.createIdentifier("res"), context.factory.createIdentifier("isSent"))
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
                          context.factory.createExpressionStatement(
                            context.factory.createCallExpression(
                              context.factory.createPropertyAccessExpression(
                                context.factory.createCallExpression(
                                  context.factory.createPropertyAccessExpression(
                                    context.factory.createCallExpression(
                                      context.factory.createPropertyAccessExpression(context.factory.createIdentifier("res"), context.factory.createIdentifier("status")),
                                      undefined,
                                      [context.factory.createNumericLiteral("404")]
                                    ),
                                    context.factory.createIdentifier("type")
                                  ),
                                  undefined,
                                  [context.factory.createStringLiteral("text/html; charset=utf-8")]
                                ),
                                context.factory.createIdentifier("send")
                              ),
                              undefined,
                              [context.factory.createStringLiteral(cantFindPath("access", lambdaName))]
                            )
                          ),
                        ],
                        true
                      ),
                      undefined
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

    // lambda handler
    context.factory.createFunctionDeclaration(
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
    ),
  ];
};
