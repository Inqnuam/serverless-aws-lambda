import ts from "typescript";

function _buildUniversalEvent(context: ts.TransformationContext) {
  return context.factory.createVariableStatement(
    undefined,
    context.factory.createVariableDeclarationList(
      [
        context.factory.createVariableDeclaration(
          context.factory.createIdentifier("_buildUniversalEvent"),
          undefined,
          undefined,
          context.factory.createArrowFunction(
            undefined,
            undefined,
            [context.factory.createParameterDeclaration(undefined, undefined, undefined, context.factory.createIdentifier("awsAlbEvent"), undefined, undefined, undefined)],
            undefined,
            context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            context.factory.createBlock(
              [
                context.factory.createVariableStatement(
                  undefined,
                  context.factory.createVariableDeclarationList(
                    [
                      context.factory.createVariableDeclaration(
                        context.factory.createIdentifier("universalEvent"),
                        undefined,
                        undefined,
                        context.factory.createObjectLiteralExpression([context.factory.createSpreadAssignment(context.factory.createIdentifier("awsAlbEvent"))], false)
                      ),
                    ],
                    ts.NodeFlags.Let
                  )
                ),
                context.factory.createExpressionStatement(
                  context.factory.createBinaryExpression(
                    context.factory.createPropertyAccessExpression(context.factory.createIdentifier("universalEvent"), context.factory.createIdentifier("query")),
                    context.factory.createToken(ts.SyntaxKind.EqualsToken),
                    context.factory.createObjectLiteralExpression([], false)
                  )
                ),
                context.factory.createExpressionStatement(
                  context.factory.createBinaryExpression(
                    context.factory.createPropertyAccessExpression(context.factory.createIdentifier("universalEvent"), context.factory.createIdentifier("method")),
                    context.factory.createToken(ts.SyntaxKind.EqualsToken),
                    context.factory.createPropertyAccessExpression(context.factory.createIdentifier("awsAlbEvent"), context.factory.createIdentifier("httpMethod"))
                  )
                ),
                context.factory.createForOfStatement(
                  undefined,
                  context.factory.createVariableDeclarationList(
                    [
                      context.factory.createVariableDeclaration(
                        context.factory.createArrayBindingPattern([
                          context.factory.createBindingElement(undefined, undefined, context.factory.createIdentifier("key"), undefined),
                          context.factory.createBindingElement(undefined, undefined, context.factory.createIdentifier("value"), undefined),
                        ]),
                        undefined,
                        undefined,
                        undefined
                      ),
                    ],
                    ts.NodeFlags.Const
                  ),
                  context.factory.createCallExpression(
                    context.factory.createPropertyAccessExpression(context.factory.createIdentifier("Object"), context.factory.createIdentifier("entries")),
                    undefined,
                    [context.factory.createPropertyAccessExpression(context.factory.createIdentifier("awsAlbEvent"), context.factory.createIdentifier("queryStringParameters"))]
                  ),
                  context.factory.createBlock(
                    [
                      context.factory.createExpressionStatement(
                        context.factory.createBinaryExpression(
                          context.factory.createElementAccessExpression(
                            context.factory.createPropertyAccessExpression(context.factory.createIdentifier("universalEvent"), context.factory.createIdentifier("query")),
                            context.factory.createIdentifier("key")
                          ),
                          context.factory.createToken(ts.SyntaxKind.EqualsToken),
                          context.factory.createCallExpression(context.factory.createIdentifier("decodeURIComponent"), undefined, [context.factory.createIdentifier("value")])
                        )
                      ),
                    ],
                    true
                  )
                ),
                context.factory.createReturnStatement(context.factory.createIdentifier("universalEvent")),
              ],
              true
            )
          )
        ),
      ],
      ts.NodeFlags.Const
    )
  );
}
export { _buildUniversalEvent };
