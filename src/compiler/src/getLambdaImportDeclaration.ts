import ts from "typescript";
import { ILambdaCompiler } from "./declarations";
import { _buildUniversalEvent } from "./buildUniversalEvent";
import { _ResponseHandlerAST } from "./buildResponseHandler";

const pkgPath = "serverless-aws-lambda";
export function getLambdaImportDeclaration(this: ILambdaCompiler, context: ts.TransformationContext, node: ts.Node) {
  if (ts.isImportDeclaration(node)) {
    // @ts-ignore
    if (node.moduleSpecifier?.text == pkgPath) {
      // @ts-ignore
      const importElements = node.importClause?.namedBindings?.elements;

      if (importElements) {
        const importElement = importElements.find((x) => x.name.escapedText == "Lambda" || x.propertyName?.escapedText == "Lambda");
        if ((importElement && importElement.name.escapedText == "Lambda") || importElement.propertyName?.escapedText == "Lambda") {
          const lambdaClassImportedName = importElement.name.escapedText;
          this.importClauses.add(lambdaClassImportedName);

          if (this.defaultsAreSet) {
            return null;
          } else {
            this.defaultsAreSet = true;
            return context.factory.updateSourceFile(node as unknown as ts.SourceFile, [_ResponseHandlerAST(context), _buildUniversalEvent(context)]);
          }
        }
      } else {
        // as import all ...

        const importAllName =
          // @ts-ignore
          node.importClause?.namedBindings?.name.escapedText;

        if (importAllName) {
          this.importAllNames.add(importAllName);
          if (this.defaultsAreSet) {
            return null;
          } else {
            this.defaultsAreSet = true;
            return context.factory.updateSourceFile(node as unknown as ts.SourceFile, [_ResponseHandlerAST(context), _buildUniversalEvent(context)]);
          }
        }
      }
    }
  }
}
