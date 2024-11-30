# RPC Wire Format Specification

## Overview

This document describes the wire format for the RPC framework, including both normal message flows and error handling.

## Message Types

The framework supports three types of messages:
1. Request Messages
2. Response Messages
3. Error Response Messages

## Wire Format

### 1. Request Message Format

[total length (4 bytes)][request ID (4 bytes)][method name length (1 byte)][method name (variable)][payload (variable)]


- `total length`: uint32, big-endian, includes all fields except itself
- `request ID`: uint32, big-endian, MSB must be 0
- `method name length`: uint8, length of the method name string
- `method name`: UTF-8 encoded string (format: "ServiceName.MethodName")
- `payload`: Protobuf encoded request message

### 2. Response Message Format

[total length (4 bytes)][response ID (4 bytes)][payload (variable)]


- `total length`: uint32, big-endian, includes all fields except itself
- `response ID`: uint32, big-endian, MSB set to 1, original request ID in lower 31 bits
- `payload`: Protobuf encoded response message

### 3. Error Response Format

[total length (4 bytes)][response ID (4 bytes)][error code (4 bytes)][error message (variable)]


- `total length`: uint32, big-endian, includes all fields except itself
- `response ID`: uint32, big-endian, MSB set to 1, original request ID in lower 31 bits
- `error code`: uint32, big-endian
- `error message`: UTF-8 encoded error string

## Error Codes

```typescript
const enum ErrorCode {
    Unknown = 0,              // Unknown or unspecified error
    MethodNotFound = 1,       // Requested method doesn't exist
    InvalidRequest = 2,       // Request is invalid
    MalformedRequest = 3,     // Request message is malformed
    InvalidMessageFormat = 4, // Message format is invalid
    InternalError = 5         // Internal server error
}
```

## Bit Flags

- `REQUEST_ID_MSB = 0x80000000`: Indicates a response message
- `ERROR_RESPONSE_MSB = 0x40000000`: Indicates an error response
- `REQUEST_ID_MASK = 0x7fffffff`: Mask for extracting the original request ID

## Examples

### 1. Request Example
For a request to "Calculator.Add" with ID 42:
```
[00 00 00 17]  // Length: 23 bytes
[00 00 00 2A]  // Request ID: 42
[0D]           // Method name length: 13
[43 61 6C 63 75 6C 61 74 6F 72 2E 41 64 64]  // "Calculator.Add"
[... payload ...]  // Protobuf encoded request
```

### 2. Normal Response Example
For a response to request ID 42:
```
[00 00 00 0C]  // Length: 12 bytes
[80 00 00 2A]  // Response ID: 42 with MSB set
[... payload ...]  // Protobuf encoded response
```

### 3. Error Response Example
For an error response to request ID 42:
```
[00 00 00 17]  // Length: 23 bytes
[C0 00 00 2A]  // Response ID: 42 with MSB and second MSB set
[00 00 00 01]  // Error Code: MethodNotFound
[43 61 6C 63 75 6C 61 74 6F 72 2E 41 64 64 20 6E 6F 74 20 66 6F 75 6E 64]  // "Calculator.Add not found"
```

## Message Flow

### Normal Request-Response Flow
1. Client generates a unique request ID
2. Client sends a Request Message
3. Server processes the request
4. Server sends a Response Message with the same request ID (with MSB set)

### Error Flow
1. Client sends a Request Message
2. If server encounters a framework-level error:
   - Sends an Error Response Message (MSB and second MSB set)
   - Includes appropriate error code and message
3. If server encounters an application-level error:
   - Sends a normal Response Message
   - Error details are encoded in the protobuf payload

## Implementation Requirements

### Endianness
- All multi-byte integers must be in big-endian format
- This includes: total length, request ID, response ID, and error code

### String Encoding
- All strings (method names, error messages) must be UTF-8 encoded
- Method names must follow the format "ServiceName.MethodName"

### Request ID Management
- Request IDs must be unique within a session
- Only lower 31 bits can be used (0x7fffffff max)
- Must wrap around to 1 when maximum is reached
- Value 0 is reserved and should not be used

### Error Handling
- Framework-level errors must use the Error Response Format
- Application-level errors should use normal responses with protobuf-defined error types
- Servers must send appropriate error responses for all error conditions

## Security Considerations

### Message Size
- Implementations should enforce reasonable limits on:
  - Total message size
  - Method name length
  - Error message length

### Request ID Validation
- Implementations must verify:
  - MSB flags are appropriate for message type
  - Request IDs are within valid range
  - Response IDs match pending requests

### Error Exposure
- Error messages should not expose sensitive internal details
- Stack traces should never be included in error messages
- Error codes should be carefully chosen to avoid information leakage
```

This expanded specification now includes:
1. Complete message format details
2. Message flow descriptions
3. Implementation requirements
4. Security considerations
5. More detailed examples
6. Clear requirements for endianness and encoding