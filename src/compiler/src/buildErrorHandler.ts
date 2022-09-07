import ts from "typescript";

export const buildErrorHandler = (
  context: ts.TransformationContext,
  lambdaName: string,
  onError: ts.Expression
) => {
  return context.factory.createVariableStatement(
    undefined,
    context.factory.createVariableDeclarationList(
      [
        context.factory.createVariableDeclaration(
          context.factory.createIdentifier(`_${lambdaName}errorCallback`),
          undefined,
          undefined,
          onError
        ),
      ],
      ts.NodeFlags.Const
    )
  );
};
