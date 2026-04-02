(module
    ;; This WebAssembly module was generated with the help of AI (model: gemini-3-flash-preview).
    (memory (import "env" "memory") 1)

    ;; Sobel operator in WASM using SIMD
    ;; gx = ( -1*p00 + 1*p02 - 2*p10 + 2*p12 - 1*p20 + 1*p22 )
    ;; gy = ( -1*p00 - 2*p01 - 1*p02 + 1*p20 + 2*p21 + 1*p22 )
    ;; magnitude = sqrt(gx*gx + gy*gy)
    ;; direction = atan2(gy, gx)

    (func (export "sobel")
        (param $src i32) (param $magnitude i32) (param $gx_addr i32) (param $gy_addr i32) (param $width i32) (param $height i32) (param $stride i32)
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

        (local $p12 v128)
        (local $p20 v128)
        (local $p21 v128)
        (local $p22 v128)
        (local $end_simd i32)
        (local $mag4 v128)
        (local $gx f32)
        (local $gy f32)

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

                    ;; store gx/gy in direction buffer temporarily
                    ;; We'll store GX in the direction buffer, and GY in a new buffer we pass?
                    ;; Actually, let's just use the direction buffer for GX and another for GY.
                    ;; But the caller only expects magnitude and direction.
                    ;; Let's change the signature to (src, magnitude, gx, gy, width, height, stride)
                    (v128.store
                        (i32.add
                            (local.get $gx_addr)
                            (i32.add
                                (i32.mul
                                    (local.get $y)
                                    (local.get $stride4))
                                (i32.mul
                                    (local.get $x)
                                    (i32.const 4))))
                        (local.get $gx4))
                    (v128.store
                        (i32.add
                            (local.get $gy_addr)
                            (i32.add
                                (i32.mul
                                    (local.get $y)
                                    (local.get $stride4))
                                (i32.mul
                                    (local.get $x)
                                    (i32.const 4))))
                        (local.get $gy4))

                    (local.set $x
                        (i32.add
                            (local.get $x)
                            (i32.const 4)))
                    (br $x_loop)))

            ;; Scalar fallback for end of row
            (loop $scalar_x_loop
                (block $exit_scalar_x
                    (br_if $exit_scalar_x
                        (i32.ge_s
                            (local.get $x)
                            (i32.sub
                                (local.get $width)
                                (i32.const 1))))

                    (f32.store
                        (i32.add
                            (local.get $magnitude)
                            (i32.add
                                (i32.mul
                                    (local.get $y)
                                    (local.get $stride4))
                                (i32.mul
                                    (local.get $x)
                                    (i32.const 4))))
                        (f32.sqrt
                            (f32.add
                                (f32.mul
                                    (local.tee $gx
                                        (f32.add
                                            (f32.sub
                                                (f32.load
                                                    (i32.add
                                                        (local.get $row_prev)
                                                        (i32.mul
                                                            (i32.add
                                                                (local.get $x)
                                                                (i32.const 1))
                                                            (i32.const 4))))
                                                (f32.load
                                                    (i32.add
                                                        (local.get $row_prev)
                                                        (i32.mul
                                                            (i32.sub
                                                                (local.get $x)
                                                                (i32.const 1))
                                                            (i32.const 4)))))
                                            (f32.add
                                                (f32.mul
                                                    (f32.sub
                                                        (f32.load
                                                            (i32.add
                                                                (local.get $row_curr)
                                                                (i32.mul
                                                                    (i32.add
                                                                        (local.get $x)
                                                                        (i32.const 1))
                                                                    (i32.const 4))))
                                                        (f32.load
                                                            (i32.add
                                                                (local.get $row_curr)
                                                                (i32.mul
                                                                    (i32.sub
                                                                        (local.get $x)
                                                                        (i32.const 1))
                                                                    (i32.const 4)))))
                                                    (f32.const 2))
                                                (f32.sub
                                                    (f32.load
                                                        (i32.add
                                                            (local.get $row_next)
                                                            (i32.mul
                                                                (i32.add
                                                                    (local.get $x)
                                                                    (i32.const 1))
                                                                (i32.const 4))))
                                                    (f32.load
                                                        (i32.add
                                                            (local.get $row_next)
                                                            (i32.mul
                                                                (i32.sub
                                                                    (local.get $x)
                                                                    (i32.const 1))
                                                                (i32.const 4))))))))
                                    (local.get $gx))
                                (f32.mul
                                    (local.tee $gy
                                        (f32.add
                                            (f32.add
                                                (f32.load
                                                    (i32.add
                                                        (local.get $row_next)
                                                        (i32.mul
                                                            (i32.sub
                                                                (local.get $x)
                                                                (i32.const 1))
                                                            (i32.const 4))))
                                                (f32.add
                                                    (f32.mul
                                                        (f32.load
                                                            (i32.add
                                                                (local.get $row_next)
                                                                (i32.mul
                                                                    (local.get $x)
                                                                    (i32.const 4))))
                                                        (f32.const 2))
                                                    (f32.load
                                                        (i32.add
                                                            (local.get $row_next)
                                                            (i32.mul
                                                                (i32.add
                                                                    (local.get $x)
                                                                    (i32.const 1))
                                                                (i32.const 4))))))
                                            (f32.neg
                                                (f32.add
                                                    (f32.load
                                                        (i32.add
                                                            (local.get $row_prev)
                                                            (i32.mul
                                                                (i32.sub
                                                                    (local.get $x)
                                                                    (i32.const 1))
                                                                (i32.const 4))))
                                                    (f32.add
                                                        (f32.mul
                                                            (f32.load
                                                                (i32.add
                                                                    (local.get $row_prev)
                                                                    (i32.mul
                                                                        (local.get $x)
                                                                        (i32.const 4))))
                                                            (f32.const 2))
                                                        (f32.load
                                                            (i32.add
                                                                (local.get $row_prev)
                                                                (i32.mul
                                                                    (i32.add
                                                                        (local.get $x)
                                                                        (i32.const 1))
                                                                    (i32.const 4)))))))))
                                    (local.get $gy)))))
                    (f32.store
                        (i32.add
                            (local.get $gx_addr)
                            (i32.add
                                (i32.mul
                                    (local.get $y)
                                    (local.get $stride4))
                                (i32.mul
                                    (local.get $x)
                                    (i32.const 4))))
                        (local.get $gx))
                    (f32.store
                        (i32.add
                            (local.get $gy_addr)
                            (i32.add
                                (i32.mul
                                    (local.get $y)
                                    (local.get $stride4))
                                (i32.mul
                                    (local.get $x)
                                    (i32.const 4))))
                        (local.get $gy))

                    (local.set $x
                        (i32.add
                            (local.get $x)
                            (i32.const 1)))
                    (br $scalar_x_loop)))

            (local.set $y
                (i32.add
                    (local.get $y)
                    (i32.const 1)))
            (br_if $y_loop
                (i32.lt_s
                    (local.get $y)
                    (i32.sub
                        (local.get $height)
                        (i32.const 1)))))))
