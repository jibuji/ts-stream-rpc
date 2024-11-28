export interface DuplexStream {
    write(data: Uint8Array): Promise<void>;
    readFull(buf: Uint8Array): Promise<void>;
	close(): void;
}
