(module
    ;; This WebAssembly module was generated with the help of AI (model: gemini-3-flash-preview).
    (memory (import "env" "memory") 1)

    ;; Sobel operator in WASM using SIMD
    ;; gx = ( -1*p00 + 1*p02 - 2*p10 + 2*p12 - 1*p20 + 1*p22 )
    ;; gy = ( -1*p00 - 2*p01 - 1*p02 + 1*p20 + 2*p21 + 1*p22 )
    ;; magnitude = sqrt(gx*gx + gy*gy)
    ;; direction = atan2(gy, gx)

    (func (export "sobel")
        (param $src i32) (param $magnitude i32) (param $neighbor_addr i32) (param $width i32) (param $height i32) (param $stride i32)
        (local $y i32)
        (local $x i32)
        (local $stride4 i32)
        (local $row_prev i32)
        (local $row_curr i32)
        (local $row_next i32)
        (local $gx4 v128)
        (local $gy4 v128)
        (local $p00 v128)
        (local $p01 v128)
        (local $p02 v128)
        (local $p10 v128)
        (local $p11 v128)
        (local $p12 v128)
        (local $p20 v128)
        (local $p21 v128)
        (local $p22 v128)
        (local $end_simd i32)
        (local $mag4 v128)
        (local $gx f32)
        (local $gy f32)

        ;; Locals for neighbor number calculation
        (local $ratio4 v128)
        (local $abs_ratio4 v128)
        (local $diagonal4 v128)
        (local $neighbor4 v128)
        (local $mask v128)
        (local $tmp v128)

        (local.set $stride4
            (i32.mul
                (local.get $stride)
                (i32.const 4)))
        (local.set $end_simd
            (i32.sub
                (local.get $width)
                (i32.const 5)))

        (local.set $y
            (i32.const 1))
        (loop $y_loop
            (local.set $row_prev
                (i32.add
                    (local.get $src)
                    (i32.mul
                        (i32.sub
                            (local.get $y)
                            (i32.const 1))
                        (local.get $stride4))))
            (local.set $row_curr
                (i32.add
                    (local.get $src)
                    (i32.mul
                        (local.get $y)
                        (local.get $stride4))))
            (local.set $row_next
                (i32.add
                    (local.get $src)
                    (i32.mul
                        (i32.add
                            (local.get $y)
                            (i32.const 1))
                        (local.get $stride4))))

            (local.set $x
                (i32.const 1))
            (loop $x_loop
                (block $exit_simd
                    (br_if $exit_simd
                        (i32.gt_s
                            (local.get $x)
                            (local.get $end_simd)))

                    ;; Load p00, p01, p02
                    (local.set $p00
                        (v128.load
                            (i32.add
                                (local.get $row_prev)
                                (i32.mul
                                    (i32.sub
                                        (local.get $x)
                                        (i32.const 1))
                                    (i32.const 4)))))
                    (local.set $p01
                        (v128.load
                            (i32.add
                                (local.get $row_prev)
                                (i32.mul
                                    (local.get $x)
                                    (i32.const 4)))))
                    (local.set $p02
                        (v128.load
                            (i32.add
                                (local.get $row_prev)
                                (i32.mul
                                    (i32.add
                                        (local.get $x)
                                        (i32.const 1))
                                    (i32.const 4)))))

                    ;; Load p10, p11, p12
                    (local.set $p10
                        (v128.load
                            (i32.add
                                (local.get $row_curr)
                                (i32.mul
                                    (i32.sub
                                        (local.get $x)
                                        (i32.const 1))
                                    (i32.const 4)))))
                    (local.set $p12
                        (v128.load
                            (i32.add
                                (local.get $row_curr)
                                (i32.mul
                                    (i32.add
                                        (local.get $x)
                                        (i32.const 1))
                                    (i32.const 4)))))

                    ;; Load p20, p21, p22
                    (local.set $p20
                        (v128.load
                            (i32.add
                                (local.get $row_next)
                                (i32.mul
                                    (i32.sub
                                        (local.get $x)
                                        (i32.const 1))
                                    (i32.const 4)))))
                    (local.set $p21
                        (v128.load
                            (i32.add
                                (local.get $row_next)
                                (i32.mul
                                    (local.get $x)
                                    (i32.const 4)))))
                    (local.set $p22
                        (v128.load
                            (i32.add
                                (local.get $row_next)
                                (i32.mul
                                    (i32.add
                                        (local.get $x)
                                        (i32.const 1))
                                    (i32.const 4)))))

                    ;; gx = p02 - p00 + 2*p12 - 2*p10 + p22 - p20
                    (local.set $gx4
                        (f32x4.sub
                            (local.get $p02)
                            (local.get $p00)))
                    (local.set $gx4
                        (f32x4.add
                            (local.get $gx4)
                            (f32x4.mul
                                (f32x4.sub
                                    (local.get $p12)
                                    (local.get $p10))
                                (v128.const f32x4 2 2 2 2))))
                    (local.set $gx4
                        (f32x4.add
                            (local.get $gx4)
                            (f32x4.sub
                                (local.get $p22)
                                (local.get $p20))))

                    ;; gy = p20 + 2*p21 + p22 - p00 - 2*p01 - p02
                    (local.set $gy4
                        (f32x4.add
                            (local.get $p20)
                            (local.get $p22)))
                    (local.set $gy4
                        (f32x4.add
                            (local.get $gy4)
                            (f32x4.mul
                                (local.get $p21)
                                (v128.const f32x4 2 2 2 2))))
                    (local.set $gy4
                        (f32x4.sub
                            (local.get $gy4)
                            (local.get $p00)))
                    (local.set $gy4
                        (f32x4.sub
                            (local.get $gy4)
                            (local.get $p02)))
                    (local.set $gy4
                        (f32x4.sub
                            (local.get $gy4)
                            (f32x4.mul
                                (local.get $p01)
                                (v128.const f32x4 2 2 2 2))))

                    ;; magnitude = sqrt(gx*gx + gy*gy)
                    (local.set $mag4
                        (f32x4.sqrt
                            (f32x4.add
                                (f32x4.mul
                                    (local.get $gx4)
                                    (local.get $gx4))
                                (f32x4.mul
                                    (local.get $gy4)
                                    (local.get $gy4)))))

                    ;; store magnitude
                    (v128.store
                        (i32.add
                            (local.get $magnitude)
                            (i32.add
                                (i32.mul
                                    (local.get $y)
                                    (local.get $stride4))
                                (i32.mul
                                    (local.get $x)
                                    (i32.const 4))))
                        (local.get $mag4))

                    ;; Compute neighbor number
                    ;; ratio = gy / gx
                    (local.set $ratio4
                        (f32x4.div
                            (local.get $gy4)
                            (local.get $gx4)))
                    (local.set $abs_ratio4
                        (f32x4.abs
                            (local.get $ratio4)))

                    ;; let neighbor = 0
                    (local.set $neighbor4
                        (v128.const i32x4 0 0 0 0))

                    ;; diagonal = 1 - sign(ratio)
                    ;; sign(ratio) is 1 if ratio >= 0, -1 if ratio < 0
                    ;; diagonal = 1 - 1 = 0 if ratio >= 0
                    ;; diagonal = 1 - (-1) = 2 if ratio < 0
                    (local.set $mask
                        (f32x4.ge
                            (local.get $ratio4)
                            (v128.const f32x4 0 0 0 0)))
                    (local.set $diagonal4
                        (v128.bitselect
                            (v128.const i32x4 0 0 0 0)    ;; ratio >= 0
                            (v128.const i32x4 2 2 2 2)    ;; ratio < 0
                            (local.get $mask)))

                    ;; if absRatio >= 0.4142, neighbor = 1
                    (local.set $mask
                        (f32x4.ge
                            (local.get $abs_ratio4)
                            (v128.const f32x4 0.4142 0.4142 0.4142 0.4142)))
                    (local.set $neighbor4
                        (v128.bitselect
                            (v128.const i32x4 1 1 1 1)
                            (local.get $neighbor4)
                            (local.get $mask)))

                    ;; if neighbor == 1 AND absRatio <= 2.4142, neighbor = 1 + diagonal
                    (local.set $mask
                        (v128.and
                            (i32x4.eq
                                (local.get $neighbor4)
                                (v128.const i32x4 1 1 1 1))
                            (f32x4.le
                                (local.get $abs_ratio4)
                                (v128.const f32x4 2.4142 2.4142 2.4142 2.4142))))
                    (local.set $neighbor4
                        (v128.bitselect
                            (i32x4.add
                                (v128.const i32x4 1 1 1 1)
                                (local.get $diagonal4))
                            (local.get $neighbor4)
                            (local.get $mask)))

                    ;; if neighbor == 1 AND absRatio > 2.4142, neighbor = 2
                    (local.set $mask
                        (v128.and
                            (i32x4.eq
                                (local.get $neighbor4)
                                (v128.const i32x4 1 1 1 1))
                            (f32x4.gt
                                (local.get $abs_ratio4)
                                (v128.const f32x4 2.4142 2.4142 2.4142 2.4142))))
                    (local.set $neighbor4
                        (v128.bitselect
                            (v128.const i32x4 2 2 2 2)
                            (local.get $neighbor4)
                            (local.get $mask)))

                    ;; if gx == 0 and gy == 0, neighbor = 0

                    ;; Store neighbor numbers as 4 uint8 at once
                    (v128.store32_lane 0
                        (i32.add
                            (local.get $neighbor_addr)
                            (i32.add
                                (i32.mul
                                    (local.get $y)
                                    (local.get $stride))
                                (local.get $x)))
                        (i8x16.shuffle 0 4 8 12 16 17 18 19 20 21 22 23 24 25 26 27
                            (local.get $neighbor4)
                            (v128.const i8x16 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0))
                        )

                    (local.set $x
                        (i32.add
                            (local.get $x)
                            (i32.const 4)))
                    (br $x_loop))

                ;; Scalar fallback for tail removed
            )

            (local.set $y
                (i32.add
                    (local.get $y)
                    (i32.const 1)))
            (br_if $y_loop
                (i32.lt_s
                    (local.get $y)
                    (i32.sub
                        (local.get $height)
                        (i32.const 1))))))

    (func (export "non_maximum_suppression")
        (param $magnitude i32) (param $neighbor i32) (param $output i32) (param $width i32) (param $height i32) (param $stride i32)
        (local $y i32)
        (local $x i32)
        (local $idx i32)
        (local $num i32)
        (local $offset i32)
        (local $m f32)
        (local $q f32)
        (local $r f32)

        (local.set $y (i32.const 1))
        (loop $y_loop
            (local.set $x (i32.const 1))
            (loop $x_loop
                (local.set $idx
                    (i32.add
                        (i32.mul (local.get $y) (local.get $stride))
                        (local.get $x)))

                ;; Load magnitude m
                (local.set $m
                    (f32.load
                        (i32.add
                            (local.get $magnitude)
                            (i32.mul (local.get $idx) (i32.const 4)))))

                (if (f32.gt (local.get $m) (f32.const 0))
                    (then
                        ;; Load neighbor number (uint8)
                        (local.set $num
                            (i32.load8_u
                                (i32.add
                                    (local.get $neighbor)
                                    (local.get $idx))))

                        ;; Determine offset based on num: [1, stride + 1, stride, stride - 1]
                        (local.set $offset
                            (if (result i32) (i32.eq (local.get $num) (i32.const 0))
                                (then (i32.const 1))
                                (else
                                    (if (result i32) (i32.eq (local.get $num) (i32.const 1))
                                        (then (i32.add (local.get $stride) (i32.const 1)))
                                        (else
                                            (if (result i32) (i32.eq (local.get $num) (i32.const 2))
                                                (then (local.get $stride))
                                                (else (i32.sub (local.get $stride) (i32.const 1)))))))))

                        ;; Load q = magnitude[idx + offset]
                        (local.set $q
                            (f32.load
                                (i32.add
                                    (local.get $magnitude)
                                    (i32.mul
                                        (i32.add (local.get $idx) (local.get $offset))
                                        (i32.const 4)))))

                        ;; Load r = magnitude[idx - offset]
                        (local.set $r
                            (f32.load
                                (i32.add
                                    (local.get $magnitude)
                                    (i32.mul
                                        (i32.sub (local.get $idx) (local.get $offset))
                                        (i32.const 4)))))

                        ;; if m >= q && m >= r, output = m, else 0
                        (if (i32.and
                                (f32.ge (local.get $m) (local.get $q))
                                (f32.ge (local.get $m) (local.get $r)))
                            (then
                                (f32.store
                                    (i32.add
                                        (local.get $output)
                                        (i32.mul (local.get $idx) (i32.const 4)))
                                    (local.get $m)))
                            (else
                                (f32.store
                                    (i32.add
                                        (local.get $output)
                                        (i32.mul (local.get $idx) (i32.const 4)))
                                    (f32.const 0))))
                    )
                    (else
                        ;; Output 0 if magnitude is 0
                        (f32.store
                            (i32.add
                                (local.get $output)
                                (i32.mul (local.get $idx) (i32.const 4)))
                            (f32.const 0))
                    )
                )

                (local.set $x (i32.add (local.get $x) (i32.const 1)))
                (br_if $x_loop
                    (i32.lt_s
                        (local.get $x)
                        (i32.sub (local.get $width) (i32.const 1))))
            )

            (local.set $y (i32.add (local.get $y) (i32.const 1)))
            (br_if $y_loop
                (i32.lt_s
                    (local.get $y)
                    (i32.sub (local.get $height) (i32.const 1))))
        )
    )
)
