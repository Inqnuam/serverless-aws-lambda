import ts from "typescript";
import { ILambdaCompiler } from "./declarations";

export function getLambdaVarStatement(this: ILambdaCompiler, node: ts.Node) {
  if (ts.isVariableStatement(node)) {
    const initializer = node.declarationList?.declarations?.[0];

    if (initializer) {
      if (
        // @ts-ignore
        initializer.initializer?.expression &&
        // @ts-ignore
        ts.isIdentifier(initializer.initializer?.expression) &&
        // @ts-ignore
        this.importClauses.has(initializer.initializer?.expression?.text)
      ) {
        // @ts-ignore
        const varName = initializer.name?.text;
        this.varDeclarationsList[varName] = {
          handler: [],
          onError: [],
        };

        return true;
      } else {
        // @ts-ignore
        const initializerName =
          // @ts-ignore
          initializer.initializer?.expression?.escapedText;
        // @ts-ignore
        const varName = initializer.name?.escapedText;
        if (
          initializerName &&
          varName &&
          this.importAllNames.has(initializerName)
        ) {
          this.importClauses.add(varName);
          return true;
        }
      }
    }
  }
}
