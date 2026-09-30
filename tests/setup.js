import 'fake-indexeddb/auto';
import {webcrypto} from 'node:crypto';
Object.defineProperty(globalThis,'crypto',{value:webcrypto});
URL.createObjectURL=()=> 'blob:nightreader-test';URL.revokeObjectURL=()=>{};
