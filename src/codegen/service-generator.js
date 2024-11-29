import fs from 'fs';
import protobuf from 'protobufjs';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const usage = 'Usage: node service-generator.js --proto <proto_file> --out <output_file>';

let protoPath = '';
let outputPath = '';

// Parse arguments
for (let i = 0; i < args.length; i += 2) {
  switch (args[i]) {
    case '--proto':
      protoPath = args[i + 1];
      break;
    case '--out':
      outputPath = args[i + 1];
      break;
    default:
      console.error(`Unknown argument: ${args[i]}`);
      console.error(usage);
      process.exit(1);
  }
}

// Validate arguments
if (!protoPath || !outputPath) {
  console.error('Missing required arguments');
  console.error(usage);
  process.exit(1);
}

// Ensure output directory exists
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function getPackageName(root) {
  // Get the package name from the proto file
  const packages = [];
  for (const namespace of root.nestedArray || []) {
    if (namespace instanceof protobuf.Namespace) {
      packages.push(namespace.name);
    }
  }
  return packages[0] || 'proto'; // Default to 'proto' if no package found
}

function generateServiceInterface(service, outputPath, packageName) {
  const protoImportPath = path.join(
    path.relative(path.dirname(outputPath), path.dirname(outputPath)),
    `${path.basename(outputPath, '-service.ts')}.proto`
  ).replace(/\\/g, '/');

  let code = `import { DuplexStream } from 'ts-stream-rpc';\n`;
  code += `import { RpcPeer } from 'ts-stream-rpc';\n`;
  code += `import { ${packageName} } from './${protoImportPath}';\n\n`;

  // Generate interfaces for request/response types
  service.methodsArray.forEach(method => {
    // Resolve request and response types
    const inputType = service.lookup(method.requestType);
    const outputType = service.lookup(method.responseType);
    
    if (!inputType || !outputType) {
      throw new Error(`Could not resolve types for method ${method.name}`);
    }

    // Generate request interface
    const inputTypeName = inputType.name;
    code += `export interface ${inputTypeName} {\n`;
    Object.entries(inputType.fields).forEach(([name, field]) => {
      code += `  ${name}: ${getTypeScriptType(field)};\n`;
    });
    code += `}\n\n`;

    // Generate response interface
    const outputTypeName = outputType.name;
    code += `export interface ${outputTypeName} {\n`;
    Object.entries(outputType.fields).forEach(([name, field]) => {
      code += `  ${name}: ${getTypeScriptType(field)};\n`;
    });
    code += `}\n\n`;
  });

  // Generate service interface
  code += `export interface I${service.name} {\n`;
  service.methodsArray.forEach(method => {
    const methodName = method.name.charAt(0).toLowerCase() + method.name.slice(1);
    const inputTypeName = service.lookup(method.requestType).name;
    const outputTypeName = service.lookup(method.responseType).name;
    code += `  ${methodName}(request: ${inputTypeName}): Promise<${outputTypeName}>;\n`;
  });
  code += `}\n\n`;

  // Generate client class with RpcPeer constructor
  code += `export class ${service.name}Client implements I${service.name} {\n`;
  code += `  constructor(private peer: RpcPeer) {}\n\n`;

  service.methodsArray.forEach(method => {
    const methodName = method.name.charAt(0).toLowerCase() + method.name.slice(1);
    const inputTypeName = service.lookup(method.requestType).name;
    const outputTypeName = service.lookup(method.responseType).name;
    code += `  async ${methodName}(request: ${inputTypeName}): Promise<${outputTypeName}> {\n`;
    code += `    const requestBytes = ${packageName}.${inputTypeName}.encode(request).finish();\n`;
    code += `    const response = await this.peer.call<${outputTypeName}>('${service.name}.${method.name}', requestBytes, ${packageName}.${outputTypeName});\n`;
    code += `    return response;\n`;
    code += `  }\n\n`;
  });
  code += `}\n\n`;

  // Generate service wrapper
  code += `export class ${service.name}Wrapper {\n`;
  code += `  constructor(private service: I${service.name}) {}\n\n`;
  
  service.methodsArray.forEach(method => {
    const methodName = method.name.charAt(0).toLowerCase() + method.name.slice(1);
    const inputTypeName = service.lookup(method.requestType).name;
    const outputTypeName = service.lookup(method.responseType).name;
    code += `  async ${methodName}(requestBytes: Uint8Array): Promise<Uint8Array> {\n`;
    code += `    const request = ${packageName}.${inputTypeName}.decode(requestBytes);\n`;
    code += `    const response = await this.service.${methodName}(request);\n`;
    code += `    return ${packageName}.${outputTypeName}.encode(response).finish();\n`;
    code += `  }\n`;
  });
  code += `}\n`;

  fs.writeFileSync(outputPath, code);
}

function getTypeScriptType(field) {
  switch (field.type) {
    case 'int32':
    case 'uint32':
    case 'sint32':
    case 'fixed32':
    case 'sfixed32':
    case 'double':
    case 'float':
      return 'number';
    case 'string':
      return 'string';
    case 'bool':
      return 'boolean';
    default:
      return 'any';
  }
}

// Main execution
const root = new protobuf.Root();
root.load(protoPath, { keepCase: true })
  .then((root) => {
    // Load and resolve the proto file
    root = root.resolveAll();
    
    // Get package name from proto file
    const packageName = getPackageName(root);
    
    // Get all services from the root
    const services = [];
    for (const namespace of root.nestedArray || []) {
      if (namespace instanceof protobuf.Namespace) {
        for (const obj of namespace.nestedArray || []) {
          if (obj instanceof protobuf.Service) {
            services.push(obj);
          }
        }
      } else if (namespace instanceof protobuf.Service) {
        services.push(namespace);
      }
    }

    if (services.length === 0) {
      throw new Error(`No service found in proto file: ${protoPath}`);
    }
    
    // Generate for each service found
    for (const service of services) {
      generateServiceInterface(service, outputPath, packageName);
      console.log(`Generated service interface for ${service.name} at ${outputPath}`);
    }
  })
  .catch(error => {
    console.error('Error generating service:', error);
    process.exit(1);
  }); 