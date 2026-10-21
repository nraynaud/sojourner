// TypeScript bindings for emscripten-generated code.  Automatically generated at compile time.
declare var RuntimeExports: {
    /**
     * @param {number} ptr
     * @param {string} type
     */
    getValue: (ptr: number, type?: string) => any;
    /**
     * @param {number} ptr
     * @param {number} value
     * @param {string} type
     */
    setValue: (ptr: number, value: number, type?: string) => void;
    /**
     * @param {string|null=} returnType
     * @param {Array=} argTypes
     * @param {Array=} args
     * @param {Object=} opts
     */
    ccall: (ident: any, returnType?: (string | null) | undefined, argTypes?: any[] | undefined, args?: any[] | undefined, opts?: Object | undefined) => any;
    /**
     * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
     * emscripten HEAP, returns a copy of that string as a Javascript String object.
     *
     * @param {number} ptr
     * @param {number=} maxBytesToRead - An optional length that specifies the
     *   maximum number of bytes to read. You can omit this parameter to scan the
     *   string until the first 0 byte. If maxBytesToRead is passed, and the string
     *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
     *   string will cut short at that byte index.
     * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
     * @return {string}
     */
    UTF8ToString: (ptr: number, maxBytesToRead?: number | undefined, ignoreNul?: boolean | undefined) => string;
    /** @type {!Float64Array} */
    HEAPF64: Float64Array;
};
interface WasmModule {
  _get_config_layout(): number;
  _get_summary_layout(): number;
  _get_InitialProblemParams_layout(): number;
  _get_summary_full_report(): number;
  _fix_intrinsics(): void;
  _release_intrinsics(): void;
  _solve(): void;
  _get_extrinsics(): number;
  _get_intrinsics_json(): number;
  _get_extrinsics_json(): number;
  _get_camera_json(): number;
  _get_points_residuals_json(): number;
  _reset_problem(): void;
  _prepare_intrinsics(_0: number): void;
  _prepare_extrinsics(_0: number): void;
  _add_point(_0: number, _1: number, _2: number, _3: number, _4: number): number;
  _add_point_reprojection_constraint(_0: number, _1: number, _2: number, _3: number, _4: number): number;
  _add_point_positive_depth_constraint(_0: number, _1: number, _2: number): number;
  _add_direction(_0: number, _1: number, _2: number, _3: number, _4: number, _5: number, _6: number, _7: number): number;
  _free(_0: number): void;
  _malloc(_0: number): number;
}

export type MainModule = WasmModule & typeof RuntimeExports;
export default function MainModuleFactory (options?: unknown): Promise<MainModule>;
