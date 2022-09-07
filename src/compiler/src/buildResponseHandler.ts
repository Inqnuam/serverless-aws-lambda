import ts from "typescript";

const _ResponseHandlerAST = (context: ts.TransformationContext) => {
  return context.factory.createClassDeclaration(undefined, undefined, context.factory.createIdentifier("_ResponseHandler"), undefined, undefined, [
    context.factory.createPropertyDeclaration(undefined, undefined, context.factory.createIdentifier("isSent"), undefined, undefined, context.factory.createFalse()),
    context.factory.createPropertyDeclaration(
      undefined,
      undefined,
      context.factory.createIdentifier("locals"),
      undefined,
      undefined,
      context.factory.createObjectLiteralExpression([], false)
    ),
    context.factory.createPropertyDeclaration(
      undefined,
      undefined,
      context.factory.createPrivateIdentifier("#responseObject"),
      undefined,
      context.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
      undefined
    ),
    context.factory.createPropertyDeclaration(
      undefined,
      undefined,
      context.factory.createPrivateIdentifier("#resolve"),
      undefined,
      context.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
      undefined
    ),
    context.factory.createConstructorDeclaration(
      undefined,
      undefined,
      [
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          undefined,
          context.factory.createIdentifier("resolve"),
          undefined,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
          undefined
        ),
      ],
      context.factory.createBlock(
        [
          context.factory.createExpressionStatement(
            context.factory.createBinaryExpression(
              context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createPrivateIdentifier("#responseObject")),
              context.factory.createToken(ts.SyntaxKind.EqualsToken),
              context.factory.createObjectLiteralExpression(
                [
                  context.factory.createPropertyAssignment(context.factory.createIdentifier("statusCode"), context.factory.createNumericLiteral("200")),
                  context.factory.createPropertyAssignment(context.factory.createIdentifier("headers"), context.factory.createObjectLiteralExpression([], false)),
                ],
                false
              )
            )
          ),
          context.factory.createExpressionStatement(
            context.factory.createBinaryExpression(
              context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createPrivateIdentifier("#resolve")),
              context.factory.createToken(ts.SyntaxKind.EqualsToken),
              context.factory.createIdentifier("resolve")
            )
          ),
        ],
        true
      )
    ),
    context.factory.createMethodDeclaration(
      undefined,
      undefined,
      undefined,
      context.factory.createPrivateIdentifier("#returnReseponse"),
      undefined,
      undefined,
      [],
      undefined,
      context.factory.createBlock(
        [
          context.factory.createExpressionStatement(
            context.factory.createCallExpression(
              context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createPrivateIdentifier("#resolve")),
              undefined,
              [context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createPrivateIdentifier("#responseObject"))]
            )
          ),
        ],
        true
      )
    ),
    context.factory.createMethodDeclaration(
      undefined,
      undefined,
      undefined,
      context.factory.createIdentifier("status"),
      undefined,
      undefined,
      [
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          undefined,
          context.factory.createIdentifier("code"),
          undefined,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
          context.factory.createNumericLiteral("200")
        ),
      ],
      undefined,
      context.factory.createBlock(
        [
          context.factory.createExpressionStatement(
            context.factory.createBinaryExpression(
              context.factory.createPropertyAccessExpression(
                context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createPrivateIdentifier("#responseObject")),
                context.factory.createIdentifier("statusCode")
              ),
              context.factory.createToken(ts.SyntaxKind.EqualsToken),
              context.factory.createIdentifier("code")
            )
          ),
          context.factory.createReturnStatement(context.factory.createThis()),
        ],
        true
      )
    ),
    context.factory.createMethodDeclaration(
      undefined,
      undefined,
      undefined,
      context.factory.createIdentifier("set"),
      undefined,
      undefined,
      [
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          undefined,
          context.factory.createIdentifier("key"),
          undefined,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          undefined
        ),
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          undefined,
          context.factory.createIdentifier("value"),
          undefined,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          undefined
        ),
      ],
      undefined,
      context.factory.createBlock(
        [
          context.factory.createExpressionStatement(
            context.factory.createBinaryExpression(
              context.factory.createElementAccessExpression(
                context.factory.createPropertyAccessExpression(
                  context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createPrivateIdentifier("#responseObject")),
                  context.factory.createIdentifier("headers")
                ),
                context.factory.createIdentifier("key")
              ),
              context.factory.createToken(ts.SyntaxKind.EqualsToken),
              context.factory.createIdentifier("value")
            )
          ),
          context.factory.createReturnStatement(context.factory.createThis()),
        ],
        true
      )
    ),
    context.factory.createMethodDeclaration(
      undefined,
      undefined,
      undefined,
      context.factory.createIdentifier("type"),
      undefined,
      undefined,
      [
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          undefined,
          context.factory.createIdentifier("contentType"),
          undefined,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          undefined
        ),
      ],
      undefined,
      context.factory.createBlock(
        [
          context.factory.createExpressionStatement(
            context.factory.createBinaryExpression(
              context.factory.createElementAccessExpression(
                context.factory.createPropertyAccessExpression(
                  context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createPrivateIdentifier("#responseObject")),
                  context.factory.createIdentifier("headers")
                ),
                context.factory.createStringLiteral("content-type")
              ),
              context.factory.createToken(ts.SyntaxKind.EqualsToken),
              context.factory.createIdentifier("contentType")
            )
          ),
          context.factory.createReturnStatement(context.factory.createThis()),
        ],
        true
      )
    ),
    context.factory.createMethodDeclaration(
      undefined,
      undefined,
      undefined,
      context.factory.createIdentifier("cookie"),
      undefined,
      undefined,
      [
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          undefined,
          context.factory.createIdentifier("name"),
          undefined,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          undefined
        ),
      ],
      undefined,
      context.factory.createBlock([context.factory.createReturnStatement(context.factory.createThis())], true)
    ),
    context.factory.createMethodDeclaration(
      undefined,
      undefined,
      undefined,
      context.factory.createIdentifier("clearCookie"),
      undefined,
      undefined,
      [
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          undefined,
          context.factory.createIdentifier("name"),
          undefined,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          undefined
        ),
      ],
      undefined,
      context.factory.createBlock([context.factory.createReturnStatement(context.factory.createThis())], true)
    ),
    context.factory.createMethodDeclaration(
      undefined,
      undefined,
      undefined,
      context.factory.createIdentifier("json"),
      undefined,
      undefined,
      [
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          undefined,
          context.factory.createIdentifier("body"),
          undefined,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
          undefined
        ),
      ],
      undefined,
      context.factory.createBlock(
        [
          context.factory.createIfStatement(
            context.factory.createPrefixUnaryExpression(
              ts.SyntaxKind.ExclamationToken,
              context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createIdentifier("isSent"))
            ),
            context.factory.createBlock(
              [
                context.factory.createExpressionStatement(
                  context.factory.createBinaryExpression(
                    context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createIdentifier("isSent")),
                    context.factory.createToken(ts.SyntaxKind.EqualsToken),
                    context.factory.createTrue()
                  )
                ),
                context.factory.createExpressionStatement(
                  context.factory.createCallExpression(
                    context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createIdentifier("type")),
                    undefined,
                    [context.factory.createStringLiteral("application/json")]
                  )
                ),
                context.factory.createExpressionStatement(
                  context.factory.createBinaryExpression(
                    context.factory.createPropertyAccessExpression(
                      context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createPrivateIdentifier("#responseObject")),
                      context.factory.createIdentifier("body")
                    ),
                    context.factory.createToken(ts.SyntaxKind.EqualsToken),
                    context.factory.createCallExpression(
                      context.factory.createPropertyAccessExpression(context.factory.createIdentifier("JSON"), context.factory.createIdentifier("stringify")),
                      undefined,
                      [context.factory.createIdentifier("body")]
                    )
                  )
                ),
                context.factory.createExpressionStatement(
                  context.factory.createCallExpression(
                    context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createPrivateIdentifier("#returnReseponse")),
                    undefined,
                    []
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
    context.factory.createMethodDeclaration(
      undefined,
      undefined,
      undefined,
      context.factory.createIdentifier("send"),
      undefined,
      undefined,
      [
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          undefined,
          context.factory.createIdentifier("content"),
          undefined,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
          undefined
        ),
      ],
      undefined,
      context.factory.createBlock(
        [
          context.factory.createIfStatement(
            context.factory.createPrefixUnaryExpression(
              ts.SyntaxKind.ExclamationToken,
              context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createIdentifier("isSent"))
            ),
            context.factory.createBlock(
              [
                context.factory.createExpressionStatement(
                  context.factory.createBinaryExpression(
                    context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createIdentifier("isSent")),
                    context.factory.createToken(ts.SyntaxKind.EqualsToken),
                    context.factory.createTrue()
                  )
                ),
                context.factory.createExpressionStatement(
                  context.factory.createBinaryExpression(
                    context.factory.createPropertyAccessExpression(
                      context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createPrivateIdentifier("#responseObject")),
                      context.factory.createIdentifier("body")
                    ),
                    context.factory.createToken(ts.SyntaxKind.EqualsToken),
                    context.factory.createIdentifier("content")
                  )
                ),
                context.factory.createExpressionStatement(
                  context.factory.createCallExpression(
                    context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createPrivateIdentifier("#returnReseponse")),
                    undefined,
                    []
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
    context.factory.createMethodDeclaration(
      undefined,
      undefined,
      undefined,
      context.factory.createIdentifier("redirect"),
      undefined,
      undefined,
      [
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          undefined,
          context.factory.createIdentifier("code"),
          undefined,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
          undefined
        ),
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          undefined,
          context.factory.createIdentifier("path"),
          undefined,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          undefined
        ),
      ],
      undefined,
      context.factory.createBlock(
        [
          context.factory.createExpressionStatement(
            context.factory.createBinaryExpression(
              context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createIdentifier("isSent")),
              context.factory.createToken(ts.SyntaxKind.EqualsToken),
              context.factory.createTrue()
            )
          ),
          context.factory.createExpressionStatement(
            context.factory.createCallExpression(
              context.factory.createPropertyAccessExpression(
                context.factory.createCallExpression(
                  context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createIdentifier("status")),
                  undefined,
                  [context.factory.createIdentifier("code")]
                ),
                context.factory.createIdentifier("set")
              ),
              undefined,
              [context.factory.createStringLiteral("Location"), context.factory.createIdentifier("path")]
            )
          ),
          context.factory.createExpressionStatement(
            context.factory.createCallExpression(
              context.factory.createPropertyAccessExpression(context.factory.createThis(), context.factory.createPrivateIdentifier("#returnReseponse")),
              undefined,
              []
            )
          ),
        ],
        true
      )
    ),
  ]);
};

export { _ResponseHandlerAST };