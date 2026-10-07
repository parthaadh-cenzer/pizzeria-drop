import * as T from "three";
import { lavaMaterial } from "./worlds.js";
import { rng } from "./palette.js";
export function makeEffects(biome) {
  const group = new T.Group(),
    city = biome === "cityscape",
    random = rng(812),
    animated = [];
  const sky = new T.Mesh(
    new T.SphereGeometry(95, 24, 12),
    new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new T.Color(city ? 0x20284f : 0x65405c) },
        bottom: { value: new T.Color(city ? 0xf3a397 : 0xf4a574) },
      },
      vertexShader:
        "varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec3 p;uniform vec3 top;uniform vec3 bottom;void main(){float h=smoothstep(-10.,65.,p.y);gl_FragColor=vec4(mix(bottom,top,h),1.);\n#include <colorspace_fragment>\n}",
    }),
  );
  sky.renderOrder = -2;
  group.add(sky);
  if (!city) {
    for (const a of [1.9, 3.1, 4.55]) {
      const m = new T.Mesh(
        new T.PlaneGeometry(1.8, 24, 1, 12),
        lavaMaterial(true),
      );
      m.position.set(Math.cos(a) * 21.0, 11, Math.sin(a) * 21.0);
      m.rotation.y = -a - Math.PI / 2;
      group.add(m);
      animated.push(m.material);
    }
    const bubbles = new T.InstancedMesh(
      new T.SphereGeometry(1, 12, 8),
      new T.MeshStandardMaterial({
        color: 0xff7817,
        emissive: 0xff4a03,
        emissiveIntensity: 0.8,
        roughness: 0.4,
      }),
      16,
    );
    const points = Array.from({ length: 16 }, () => ({
      x: (random() - 0.5) * 24,
      z: (random() - 0.5) * 24,
      phase: random() * 6,
      size: 0.25 + random() * 1.1,
    }));
    group.add(bubbles);
    const dummy = new T.Object3D();
    group.userData.bubbles = { mesh: bubbles, points, dummy };
  }
  const positions = [];
  for (let i = 0; i < 30; i++) {
    const a = [1.9, 3.1, 4.55][i % 3];
    positions.push(
      Math.cos(a) * 21 + (random() - 0.5) * 3,
      city ? -27 + random() * 50 : 8 + random() * 21,
      Math.sin(a) * 21 + (random() - 0.5) * 3,
    );
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  const smoke = new T.Points(
    geo,
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        color: { value: new T.Color(city ? 0xa5aec8 : 0x9e7787) },
      },
      vertexShader:
        "uniform float time;void main(){vec3 p=position;p.y+=mod(time*.5+position.y,5.);p.x+=sin(time*.2+position.y)*.5;vec4 v=modelViewMatrix*vec4(p,1.);gl_PointSize=1600./max(1.,-v.z);gl_Position=projectionMatrix*v;}",
      fragmentShader:
        "uniform vec3 color;void main(){float d=length(gl_PointCoord-.5)*2.;float a=pow(max(0.,1.-d*d),2.)*.22;gl_FragColor=vec4(color,a);\n#include <colorspace_fragment>\n}",
    }),
  );
  group.add(smoke);
  animated.push(smoke.material);
  return {
    group,
    update(t) {
      for (const m of animated) m.uniforms.time.value = t;
      const b = group.userData.bubbles;
      if (b)
        for (let i = 0; i < b.points.length; i++) {
          const p = b.points[i],
            u = (t * 0.3 + p.phase) % 1,
            s = Math.sin(u * Math.PI) * p.size;
          b.dummy.position.set(p.x, -1.15 + s * 0.15, p.z);
          b.dummy.scale.set(s, s * 0.65, s);
          b.dummy.updateMatrix();
          b.mesh.setMatrixAt(i, b.dummy.matrix);
        }
      if (b) b.mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
        if (o.isInstancedMesh) o.dispose();
      });
    },
  };
}
