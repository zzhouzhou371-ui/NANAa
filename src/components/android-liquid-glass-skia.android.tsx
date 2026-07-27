import { useEffect, useRef, useState, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import {
  Canvas,
  ImageShader,
  LinearGradient,
  RoundedRect,
  Shader,
  Skia,
  useImage,
  vec,
} from '@shopify/react-native-skia';

import type { LiquidGlassSkiaSpecimen } from './android-liquid-glass-skia';

interface AndroidLiquidGlassSkiaOverlayProps {
  targetRef: RefObject<View | null>;
  width: number;
  height: number;
  specimens: LiquidGlassSkiaSpecimen[];
  onReadyChange: (ready: boolean) => void;
}

const liquidGlassEffect = Skia.RuntimeEffect.Make(`
  uniform shader image;
  uniform float2 origin;
  uniform float2 size;
  uniform float radius;
  uniform float refraction;
  uniform float blurStep;

  float roundedBoxDistance(float2 position, float2 halfSize, float cornerRadius) {
    float2 q = abs(position) - halfSize + float2(cornerRadius);
    return min(max(q.x, q.y), 0.0) + length(max(q, float2(0.0))) - cornerRadius;
  }

  half4 main(float2 xy) {
    float2 local = xy - origin;
    float2 halfSize = size * 0.5;
    float2 centered = local - halfSize;
    float distanceToEdge = roundedBoxDistance(centered, halfSize, radius);
    float edgeWidth = min(7.5, min(size.x, size.y) * 0.14);
    float edge = 1.0 - smoothstep(0.0, edgeWidth, -distanceToEdge);
    float2 normalized = float2(
      centered.x / max(halfSize.x, 1.0),
      centered.y / max(halfSize.y, 1.0)
    );
    float2 normal = normalize(normalized + float2(0.0001));
    float2 samplePosition = xy - normal * edge * refraction;

    half4 centerColor = image.eval(samplePosition);
    half4 horizontalA = image.eval(samplePosition + float2(blurStep, 0.0));
    half4 horizontalB = image.eval(samplePosition - float2(blurStep, 0.0));
    half4 verticalA = image.eval(samplePosition + float2(0.0, blurStep));
    half4 verticalB = image.eval(samplePosition - float2(0.0, blurStep));
    half4 color = centerColor * 0.40
      + (horizontalA + horizontalB + verticalA + verticalB) * 0.15;

    half redEdge = image.eval(samplePosition + normal * edge * 0.7).r;
    half blueEdge = image.eval(samplePosition - normal * edge * 0.7).b;
    color.r = mix(color.r, redEdge, half(edge * 0.22));
    color.b = mix(color.b, blueEdge, half(edge * 0.22));

    float vertical = clamp(local.y / max(size.y, 1.0), 0.0, 1.0);
    float2 lightDirection = normalize(float2(-0.58, -0.82));
    float directionalRim = max(dot(normal, lightDirection), 0.0);
    float topLight = (1.0 - vertical) * 0.012;
    float rimLight = edge * (0.01 + directionalRim * 0.065);
    float bottomDepth = smoothstep(0.64, 1.0, vertical) * 0.045;
    color.rgb = color.rgb + half3(topLight + rimLight);
    color.rgb = color.rgb * half(1.0 - bottomDepth);
    return half4(color.rgb, 1.0);
  }
`);

if (!liquidGlassEffect) {
  throw new Error('Android Liquid Glass shader failed to compile.');
}

export function AndroidLiquidGlassSkiaOverlay({
  targetRef,
  width,
  height,
  specimens,
  onReadyChange,
}: AndroidLiquidGlassSkiaOverlayProps) {
  const [snapshotUri, setSnapshotUri] = useState<string | null>(null);
  const snapshotUriRef = useRef<string | null>(null);
  const snapshot = useImage(snapshotUri);

  useEffect(() => {
    if (width <= 0 || height <= 0 || !targetRef.current) {
      return undefined;
    }

    let cancelled = false;

    const timer = setTimeout(() => {
      captureRef(targetRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      })
        .then((nextUri) => {
          if (cancelled) {
            releaseCapture(nextUri);
            return;
          }

          if (snapshotUriRef.current) {
            releaseCapture(snapshotUriRef.current);
          }
          snapshotUriRef.current = nextUri;
          setSnapshotUri(nextUri);
        })
        .catch(() => {
          if (!cancelled) {
            setSnapshotUri(null);
          }
        });
    // Wait for local image assets to finish their first native draw. Capturing
    // immediately after layout only sees the gradient placeholder in dev mode.
    }, 1200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [height, targetRef, width]);

  useEffect(() => {
    onReadyChange(Boolean(snapshot));
  }, [onReadyChange, snapshot]);

  useEffect(() => () => {
    if (snapshotUriRef.current) {
      releaseCapture(snapshotUriRef.current);
      snapshotUriRef.current = null;
    }
  }, []);

  if (!snapshot || !liquidGlassEffect) {
    return null;
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {specimens.map((specimen) => (
        <View
          key={specimen.key}
          style={{
            position: 'absolute',
            left: specimen.x,
            top: specimen.y,
            width: specimen.width,
            height: specimen.height,
          }}
        >
          <Canvas style={StyleSheet.absoluteFillObject}>
            <RoundedRect
              x={0}
              y={0}
              width={specimen.width}
              height={specimen.height}
              r={specimen.radius}
            >
              <Shader
                source={liquidGlassEffect}
                uniforms={{
                  origin: vec(0, 0),
                  size: vec(specimen.width, specimen.height),
                  radius: specimen.radius,
                  refraction: specimen.key === 'circle' ? 6.2 : 5.0,
                  blurStep: 0.72,
                }}
              >
                <ImageShader
                  image={snapshot}
                  fit="fill"
                  rect={{
                    x: -specimen.x,
                    y: -specimen.y,
                    width,
                    height,
                  }}
                  tx="clamp"
                  ty="clamp"
                />
              </Shader>
            </RoundedRect>

            <RoundedRect
              x={0.6}
              y={0.6}
              width={specimen.width - 1.2}
              height={specimen.height - 1.2}
              r={Math.max(specimen.radius - 0.6, 0)}
              style="stroke"
              strokeWidth={1.2}
            >
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, specimen.height)}
                colors={[
                  'rgba(255,255,255,0.58)',
                  'rgba(255,255,255,0.06)',
                  'rgba(255,255,255,0.18)',
                ]}
                positions={[0, 0.52, 1]}
              />
            </RoundedRect>

            <RoundedRect
              x={2}
              y={2}
              width={specimen.width - 4}
              height={specimen.height - 4}
              r={Math.max(specimen.radius - 2, 0)}
              style="stroke"
              strokeWidth={0.7}
            >
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, specimen.height)}
                colors={[
                  'rgba(255,255,255,0.22)',
                  'rgba(255,255,255,0)',
                  'rgba(255,255,255,0.08)',
                ]}
                positions={[0, 0.56, 1]}
              />
            </RoundedRect>
          </Canvas>
        </View>
      ))}
    </View>
  );
}
