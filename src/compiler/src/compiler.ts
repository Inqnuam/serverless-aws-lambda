import ts from "typescript";

import { possibleExpressions, declarationList, ILambdaCompiler } from "./declarations";

import { buildLambdaHandler } from "./buildLambdaHandler";
import { buildErrorHandler } from "./buildErrorHandler";
import { getLambdaImportDeclaration } from "./getLambdaImportDeclaration";
import { getLambdaVarStatement } from "./getLambdaVarStatement";

const printer = ts.createPrinter({
  newLine: ts.NewLineKind.LineFeed,
});

function getHandlerExpressions(this: LambdaCompiler, context: ts.TransformationContext, node: ts.Node) {
  if (ts.isExpressionStatement(node)) {
    // @ts-ignore
    const initializerName = node.expression?.expression?.expression?.text;

    if (initializerName && this.varDeclarationsList[initializerName]) {
      // @ts-ignore
      const callerName = node.expression?.expression.name?.text;

      if (callerName == "handler" && this.varDeclarationsList[initializerName][callerName]) {
        this.varDeclarationsList[initializerName].handler.push(
          // @ts-ignore
          ...node.expression.arguments
        );

        const declarations = buildLambdaHandler(
          context,
          initializerName,
          // @ts-ignore
          node.expression.arguments,
          this
        );

        return context.factory.updateSourceFile(node as unknown as ts.SourceFile, declarations);
      }
    }
  }
}

function getErrorHandlerExpressions(this: LambdaCompiler, context: ts.TransformationContext, node: ts.Node) {
  if (ts.isExpressionStatement(node)) {
    // @ts-ignore
    const initializerName = node.expression?.expression?.expression?.text;

    if (initializerName && this.varDeclarationsList[initializerName]) {
      // @ts-ignore
      const callerName = node.expression?.expression.name?.text;

      if (callerName == "onError" && this.varDeclarationsList[initializerName][callerName]) {
        this.varDeclarationsList[initializerName].onError.push(
          // @ts-ignore
          ...node.expression.arguments
        );

        const declarations = buildErrorHandler(
          context,
          initializerName,
          // @ts-ignore
          ...node.expression.arguments
        );
        return declarations;
      }
    }
  }
}

function transformFac(this: LambdaCompiler, context: ts.TransformationContext) {
  const container = this;

  return (rootNode: ts.Node) => {
    function visit(node: ts.Node): ts.Node {
      const foundImport = getLambdaImportDeclaration.call(container, context, node);

      if (typeof foundImport === "object") {
        return foundImport;
      }
      const foundVar = getLambdaVarStatement.call(container, node);

      if (foundVar) {
        // @ts-ignore
        return undefined;
      }

      const foundHandlerExpr = getHandlerExpressions.call(container, context, node);

      if (foundHandlerExpr) {
        return foundHandlerExpr;
      }

      const foundErrorHandlerExpr = getErrorHandlerExpressions.call(container, context, node);

      if (foundErrorHandlerExpr) {
        return foundErrorHandlerExpr;
      }

      return ts.visitEachChild(node, visit, context);
    }

    return ts.visitNode(rootNode, visit);
  };
}
export class LambdaCompiler implements ILambdaCompiler {
  defaultsAreSet: boolean = false;
  outputText: string[] = [];
  varDeclarationsList: declarationList = {};
  sourceFile: ts.SourceFile;

  importClauses = new Set();
  importAllNames = new Set();
  isDev: boolean;
  output: string = "";
  // TODO: passes isDev to builders
  constructor(filePath: string, isDev: boolean) {
    this.isDev = isDev;
    const program = ts.createProgram([filePath], {});
    this.sourceFile = program.getSourceFile(filePath)!;

    const transformationResult = ts.transform(this.sourceFile, [transformFac.bind(this)], { removeComments: true });

    const transformedSourceFile = transformationResult.transformed[0];

    const code = printer.printNode(ts.EmitHint.Unspecified, transformedSourceFile, this.sourceFile);

    this.output = code;

    // console.log(this.varDeclarationsList);
  }
}
//
