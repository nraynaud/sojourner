(module
    ;; This WebAssembly module was generated with the help of AI (model: gemini-3-flash-preview).
    (memory (import "env" "memory") 1)

    ;; In transpose mode, we always write the output to columns if input was rows,
        ;; and to rows if input was columns.
        ;; However, to keep it simple and consistent with "reading is easier":
        ;; If mode == 0 (Row Input):
        ;;   Input: Row $fixed, pixels [$x, $x+1, $x+2, $x+3]
        ;;   Output: Col $fixed, rows [$x, $x+1, $x+2, $x+3]
        ;;   Address in output: dst + (x+lane)*out_stride*4 + fixed*4
        ;; If mode == 1 (Col Input):
        ;;   Input: Col $fixed, pixels [$y, $y+1, $y+2, $y+3] (where length is H)
        ;;   Output: Row $fixed, pixels [$y, $y+1, $y+2, $y+3]
        ;;   Address in output: dst + fixed*out_stride*4 + (y+lane)*4

    (func (export "copy_rect_transposed")
        (param $src i32) (param $dst i32) (param $x i32) (param $y i32) (param $w i32) (param $h i32) (param $src_stride i32) (param $dst_stride i32)
        (local $row_idx i32)
        (local $col_idx i32)
        (local $src_row_base i32)

        (local.set $row_idx (i32.const 0))
        (loop $row_loop
            (local.set $src_row_base (i32.add (local.get $src) (i32.mul (i32.add (local.get $y) (local.get $row_idx)) (i32.mul (local.get $src_stride) (i32.const 4)))))
            ;; In transposed copy: (src_x, src_y) -> (dst_y, dst_x)
            ;; So src row becomes dst column.
            ;; dst column base for src row (y + row_idx) is (dst + (y + row_idx) * 4)
            ;; Each element of src row (x + col_idx) goes to dst row (x + col_idx)
            ;; dst addr = dst + (x + col_idx) * dst_stride * 4 + (y + row_idx) * 4

            (local.set $col_idx (i32.const 0))
            (loop $col_loop
                (f32.store
                    (i32.add
                        (local.get $dst)
                        (i32.add
                            (i32.mul (i32.add (local.get $x) (local.get $col_idx)) (i32.mul (local.get $dst_stride) (i32.const 4)))
                            (i32.mul (i32.add (local.get $y) (local.get $row_idx)) (i32.const 4))
                        )
                    )
                    (f32.load (i32.add (local.get $src_row_base) (i32.mul (i32.add (local.get $x) (local.get $col_idx)) (i32.const 4))))
                )

                (local.set $col_idx (i32.add (local.get $col_idx) (i32.const 1)))
                (br_if $col_loop (i32.lt_s (local.get $col_idx) (local.get $w)))
            )

            (local.set $row_idx (i32.add (local.get $row_idx) (i32.const 1)))
            (br_if $row_loop (i32.lt_s (local.get $row_idx) (local.get $h)))
        )
    )

    (func (export "convolve_1d")
        (param $src i32) (param $dst i32) (param $start_fixed i32) (param $end_fixed i32) (param $length i32) (param $in_stride i32) (param $out_stride i32) (param $kernel i32) (param $ksize i32)
        (local $fixed i32)
        (local $x i32)
        (local $center i32)
        (local $i i32)
        (local $sum4 v128)
        (local $k4 v128)
        (local $s4 v128)
        (local $base_src i32)
        (local $end_simd i32)
        (local $dst_addr i32)
        (local $out_stride4 i32)

        (local.set $center (i32.div_s (local.get $ksize) (i32.const 2)))
        (local.set $out_stride4 (i32.mul (local.get $out_stride) (i32.const 4)))

        (local.set $fixed (local.get $start_fixed))
        (loop $fixed_loop
            (local.set $base_src (i32.add (local.get $src) (i32.mul (i32.mul (local.get $fixed) (local.get $in_stride)) (i32.const 4))))

            ;; SIMD loop for x from center to length - center - 4
            (local.set $x (local.get $center))
            (local.set $end_simd (i32.sub (i32.sub (local.get $length) (local.get $center)) (i32.const 4)))
            (loop $simd_loop
                (block $exit_simd
                    (br_if $exit_simd (i32.gt_s (local.get $x) (local.get $end_simd)))

                    (local.set $sum4 (v128.const f32x4 0 0 0 0))
                    (local.set $i (i32.const 0))
                    (loop $k_loop_simd
                        (local.set $k4 (v128.load32_splat (i32.add (local.get $kernel) (i32.mul (local.get $i) (i32.const 4)))))

                        (local.set $s4
                            (v128.load
                                (i32.add
                                    (local.get $base_src)
                                    (i32.mul (i32.add (local.get $x) (i32.sub (local.get $i) (local.get $center))) (i32.const 4)))))

                        (local.set $sum4 (f32x4.relaxed_madd (local.get $s4) (local.get $k4) (local.get $sum4)))

                        (local.set $i (i32.add (local.get $i) (i32.const 1)))
                        (br_if $k_loop_simd (i32.lt_s (local.get $i) (local.get $ksize)))
                    )

                    ;; Output -> Col output (transposed)
                    ;; Output pixel lane j (j=0..3) goes to row (x+j), col (fixed)
                    ;; Addr = dst + (x+j)*out_stride*4 + fixed*4
                    (local.set $dst_addr (i32.add (local.get $dst) (i32.add (i32.mul (local.get $x) (local.get $out_stride4)) (i32.mul (local.get $fixed) (i32.const 4)))))
                    (v128.store32_lane 0 (local.get $dst_addr) (local.get $sum4))
                    (local.set $dst_addr (i32.add (local.get $dst_addr) (local.get $out_stride4)))
                    (v128.store32_lane 1 (local.get $dst_addr) (local.get $sum4))
                    (local.set $dst_addr (i32.add (local.get $dst_addr) (local.get $out_stride4)))
                    (v128.store32_lane 2 (local.get $dst_addr) (local.get $sum4))
                    (local.set $dst_addr (i32.add (local.get $dst_addr) (local.get $out_stride4)))
                    (v128.store32_lane 3 (local.get $dst_addr) (local.get $sum4))

                    (local.set $x (i32.add (local.get $x) (i32.const 4)))
                    (br $simd_loop)
                )
            )

            (local.set $fixed (i32.add (local.get $fixed) (i32.const 1)))
            (br_if $fixed_loop (i32.lt_s (local.get $fixed) (local.get $end_fixed)))
        )
    )
)
