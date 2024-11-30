#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { glob } from 'glob';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

// Add detailed documentation about the tool
const TOOL_DESCRIPTION = `
TypeScript RPC Code Generator

This tool generates TypeScript code from Protocol Buffer (.proto) definitions for use with the ts-stream-rpc framework.

Input:
  - Protocol Buffer (.proto) files that define your services and messages
  - Must include a package declaration (e.g., 'package myapp;')
  - Must define at least one service with RPC methods

Output:
  For each input .proto file, generates three files in the output directory:
  1. {name}.proto.js         - JavaScript Protocol Buffer runtime code
  2. {name}.proto.d.ts       - TypeScript definitions for Protocol Buffer types
  3. {name}-service.ts       - TypeScript service interfaces and implementations

Example Usage:
  # Generate code from a single proto file
  ts-stream-rpc generate path/to/service.proto -o ./generated

  # Generate code from all proto files in a directory
  ts-stream-rpc generate ./proto -o ./generated

Directory Structure Example:
  myproject/
  ├── proto/
  │   └── calculator.proto    # Input proto file
  └── generated/             # Output directory
      ├── calculator.proto.js
      ├── calculator.proto.d.ts
      └── calculator-service.ts

Proto File Requirements:
  - Must include a package declaration
  - Service methods should use request/response message types
  - Example:
    package calculator;
    
    service Calculator {
      rpc Add(AddRequest) returns (AddResponse);
    }
`;

function validateProtoPackage(protoPath: string): boolean {
  const content = fs.readFileSync(protoPath, 'utf-8');
  return content.includes('package');
}

function generateCode(protoPath: string, outDir: string) {
  try {
    // Validate proto file has package declaration
    if (!validateProtoPackage(protoPath)) {
      console.error(chalk.red('Error: Proto file must have a package declaration.'));
      console.log(chalk.yellow('Example:'));
      console.log(chalk.yellow('package myapp;'));
      process.exit(1);
    }

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const protoName = path.basename(protoPath, '.proto');
    const protoOutPath = path.join(outDir, `${protoName}.proto.js`);
    const protoTypesPath = path.join(outDir, `${protoName}.proto.d.ts`);
    const serviceOutPath = path.join(outDir, `${protoName}-service.ts`);

    console.log(chalk.blue(`Generating code for ${chalk.bold(protoPath)}...`));

    // Generate protobuf JavaScript code
    console.log(chalk.gray('- Generating Protocol Buffer JavaScript...'));
    execSync(`pbjs -t static -w es6 --es6 -o "${protoOutPath}" "${protoPath}"`);

    // Add protobufjs import
    const protoContent = fs.readFileSync(protoOutPath, 'utf-8');
    fs.writeFileSync(protoOutPath, `import $protobuf from "protobufjs/minimal";\n${protoContent}`);

    // Generate TypeScript definitions
    console.log(chalk.gray('- Generating Protocol Buffer TypeScript definitions...'));
    execSync(`pbts -o "${protoTypesPath}" "${protoOutPath}"`);

    // Generate service code
    console.log(chalk.gray('- Generating service code...'));
    const serviceGeneratorPath = path.resolve(__dirname, '../codegen/service-generator.js');
    execSync(`node "${serviceGeneratorPath}" --proto "${protoPath}" --out "${serviceOutPath}"`);

    console.log(chalk.green('✓ Generation completed successfully!'));
    console.log(chalk.gray('\nGenerated files:'));
    console.log(chalk.gray(`- ${protoOutPath}`));
    console.log(chalk.gray(`- ${protoTypesPath}`));
    console.log(chalk.gray(`- ${serviceOutPath}`));
  } catch (error) {
    console.error(chalk.red('Error generating code:'));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

program
  .name('ts-stream-rpc')
  .description(TOOL_DESCRIPTION)
  .version('1.0.0');

program
  .command('generate')
  .description('Generate TypeScript code from Protocol Buffer definitions')
  .argument('<source>', 'Proto file or directory containing .proto files')
  .option('-o, --out <directory>', 'Output directory for generated files', './generated')
  .addHelpText('after', `
Examples:
  $ ts-stream-rpc generate service.proto
  $ ts-stream-rpc generate service.proto -o ./src/generated
  $ ts-stream-rpc generate ./proto -o ./src/generated

Notes:
  - Requires protoc compiler to be installed
  - Generated code depends on protobufjs library
  - Output directory will be created if it doesn't exist
  - Existing files in output directory will be overwritten
  `)
  .action((source, options) => {
    try {
      if (fs.statSync(source).isDirectory()) {
        // Handle directory of proto files
        const protoFiles = glob.sync(path.join(source, '**/*.proto'));
        if (protoFiles.length === 0) {
          console.error(chalk.red('Error: No .proto files found in the specified directory.'));
          process.exit(1);
        }

        console.log(chalk.blue(`Found ${protoFiles.length} proto file(s)`));
        protoFiles.forEach(protoFile => {
          generateCode(protoFile, options.out);
        });
      } else {
        // Handle single proto file
        generateCode(source, options.out);
      }
    } catch (error: unknown) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse(); 