import ts, { Set } from "typescript";

export type declarationList = {
  [key: string]: {
    onError: ts.Expression[] | ts.VariableStatement[];
    handler: ts.Expression[] | ts.VariableStatement[];
  };
};

export interface ILambdaCompiler {
  defaultsAreSet: boolean;
  outputText: string[];
  varDeclarationsList: declarationList;
  sourceFile: ts.SourceFile;
  importClauses: Set<any>;
  importAllNames: Set<any>;
  isDev: boolean;
}
