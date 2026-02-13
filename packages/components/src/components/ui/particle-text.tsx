"use client";

import React, { useEffect, useRef, useCallback } from "react";

interface Particle {
    x: number;
    y: number;
    originX: number;
    originY: number;
    vx: number;
    vy: number;
    color: string;
    size: number;
}

export interface ParticleTextProps {
    text?: string;
    className?: string;
    colors?: string[];
    particleSize?: number;
    particleGap?: number;
    mouseControls?: {
        enabled?: boolean;
        radius?: number;
        strength?: number;
    };
    backgroundColor?: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string | number;
    friction?: number;
    ease?: number;
    autoFit?: boolean;
}

const ParticleText: React.FC<ParticleTextProps> = ({
    text = "brilliant.",
    className = "",
    colors = ["#40ffaa", "#40aaff", "#ff40aa", "#aa40ff"],
    particleSize = 2,
    particleGap = 2,
    mouseControls = {
        enabled: true,
        radius: 150,
        strength: 5,
    },
    backgroundColor = "transparent",
    fontFamily = "sans-serif",
    fontSize = 200,
    fontWeight = "bold",
    friction = 0.75,
    ease = 0.05,
    autoFit = true,
}) => {
    // Destructure mouseControls to avoid object reference issues in dependency array
    const mouseEnabled = mouseControls.enabled ?? true;
    const mouseRadius = mouseControls.radius ?? 150;
    const mouseStrength = mouseControls.strength ?? 5;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const particlesRef = useRef<Particle[]>([]);
    const mouseRef = useRef({ x: -1000, y: -1000, isActive: false });
    const animationFrameRef = useRef<number>(0);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const dprRef = useRef<number>(1);
    const computedFontSizeRef = useRef<number>(fontSize);

    const calculateFitFontSize = useCallback(
        (
            ctx: CanvasRenderingContext2D,
            content: string,
            canvasWidth: number,
            canvasHeight: number,
        ): number => {
            const dpr = dprRef.current;
            const padding = 40 * dpr;
            const availableWidth = canvasWidth - padding * 2;
            const availableHeight = canvasHeight - padding * 2;

            let minSize = 10 * dpr;
            let maxSize = fontSize * dpr;
            let optimalSize = minSize;

            while (minSize <= maxSize) {
                const testSize = Math.floor((minSize + maxSize) / 2);
                ctx.font = `${fontWeight} ${testSize}px ${fontFamily}`;

                const textMetrics = ctx.measureText(content);
                const textWidth = textMetrics.width;
                const textHeight = testSize;

                if (textWidth <= availableWidth && textHeight <= availableHeight) {
                    optimalSize = testSize;
                    minSize = testSize + 1;
                } else {
                    maxSize = testSize - 1;
                }
            }

            return optimalSize / dpr;
        },
        [fontSize, fontWeight, fontFamily],
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const initParticles = () => {
            const dpr = window.devicePixelRatio || 1;
            dprRef.current = dpr;

            canvas.width = container.clientWidth * dpr;
            canvas.height = container.clientHeight * dpr;

            let effectiveFontSize = fontSize;
            if (autoFit) {
                effectiveFontSize = calculateFitFontSize(
                    ctx,
                    text,
                    canvas.width,
                    canvas.height,
                );
            }
            computedFontSizeRef.current = effectiveFontSize;

            const scaledFontSize = effectiveFontSize * dpr;

            const offscreen = document.createElement("canvas");
            offscreen.width = canvas.width;
            offscreen.height = canvas.height;
            const offCtx = offscreen.getContext("2d");
            if (!offCtx) return;

            offCtx.font = `${fontWeight} ${scaledFontSize}px ${fontFamily}`;
            offCtx.textAlign = "center";
            offCtx.textBaseline = "middle";
            offCtx.fillStyle = "#ffffff";
            offCtx.fillText(text, canvas.width / 2, canvas.height / 2);

            const imageData = offCtx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            const newParticles: Particle[] = [];
            const step = Math.max(1, Math.floor((particleSize + particleGap) * dpr));

            for (let y = 0; y < canvas.height; y += step) {
                for (let x = 0; x < canvas.width; x += step) {
                    const index = (y * canvas.width + x) * 4;
                    if (data[index + 3] > 128) {
                        const color = colors[Math.floor(Math.random() * colors.length)];
                        newParticles.push({
                            x: Math.random() * canvas.width,
                            y: Math.random() * canvas.height,
                            originX: x,
                            originY: y,
                            vx: 0,
                            vy: 0,
                            color: color,
                            size: particleSize * dpr,
                        });
                    }
                }
            }
            particlesRef.current = newParticles;
        };

        initParticles();

        const animate = () => {
            const dpr = dprRef.current;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (backgroundColor !== "transparent") {
                ctx.fillStyle = backgroundColor;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            const particles = particlesRef.current;
            const mouse = mouseRef.current;
            const scaledRadius = mouseRadius * dpr;

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];

                const dx = p.originX - p.x;
                const dy = p.originY - p.y;

                let forceX = 0;
                let forceY = 0;

                if (mouseEnabled && mouse.isActive) {
                    const mdx = mouse.x * dpr - p.x;
                    const mdy = mouse.y * dpr - p.y;
                    const mDist = Math.sqrt(mdx * mdx + mdy * mdy);

                    if (mDist < scaledRadius) {
                        const force = (scaledRadius - mDist) / scaledRadius;
                        const angle = Math.atan2(mdy, mdx);
                        forceX = -Math.cos(angle) * force * mouseStrength * 5;
                        forceY = -Math.sin(angle) * force * mouseStrength * 5;
                    }
                }

                p.vx += dx * ease + forceX;
                p.vy += dy * ease + forceY;

                p.vx *= friction;
                p.vy *= friction;

                p.x += p.vx;
                p.y += p.vy;

                ctx.fillStyle = p.color;
                ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
            }

            animationFrameRef.current = requestAnimationFrame(animate);
        };

        animate();

        resizeObserverRef.current = new ResizeObserver(() => {
            initParticles();
        });
        resizeObserverRef.current.observe(container);

        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            mouseRef.current.x = e.clientX - rect.left;
            mouseRef.current.y = e.clientY - rect.top;
            mouseRef.current.isActive = true;
        };

        const handleTouchMove = (e: TouchEvent) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            mouseRef.current.x = e.touches[0].clientX - rect.left;
            mouseRef.current.y = e.touches[0].clientY - rect.top;
            mouseRef.current.isActive = true;
        };

        const handleMouseLeave = () => {
            mouseRef.current.isActive = false;
        };

        const handleTouchEnd = () => {
            mouseRef.current.isActive = false;
        };

        if (mouseEnabled) {
            container.addEventListener("mousemove", handleMouseMove);
            container.addEventListener("mouseleave", handleMouseLeave);
            container.addEventListener("touchmove", handleTouchMove, {
                passive: false,
            });
            container.addEventListener("touchend", handleTouchEnd);
        }

        return () => {
            if (animationFrameRef.current)
                cancelAnimationFrame(animationFrameRef.current);
            if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
            if (mouseEnabled) {
                container.removeEventListener("mousemove", handleMouseMove);
                container.removeEventListener("mouseleave", handleMouseLeave);
                container.removeEventListener("touchmove", handleTouchMove);
                container.removeEventListener("touchend", handleTouchEnd);
            }
        };
    }, [
        text,
        colors,
        particleSize,
        particleGap,
        mouseEnabled,
        mouseRadius,
        mouseStrength,
        backgroundColor,
        fontFamily,
        fontSize,
        fontWeight,
        friction,
        ease,
        autoFit,
        calculateFitFontSize,
    ]);

    return (
        <div
            ref={containerRef}
            className={`w-full h-full min-h-[300px] ${className}`}
        >
            <canvas ref={canvasRef} className="block w-full h-full" />
        </div>
    );
};

ParticleText.displayName = "ParticleText";

export default ParticleText;
