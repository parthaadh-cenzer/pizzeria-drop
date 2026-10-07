import { makeCityEnvironment } from "./city.js";
import * as T from "three";
import { C, mesh, box, cylinder, bar, sphere, rng } from "./palette.js";
import { bake } from "./props.js";
import { LEVELS, layout } from "./layout.js";
export { LEVELS, layout, TILE_PITCH, TILE_SIZE } from "./layout.js";
export function makeEnvironment(biome = "volcano") {
  if (biome === "cityscape") return makeCityEnvironment();
  const g = new T.Group();
  g.name = `${biome}_environment`;
  const random = rng(88),
    city = biome === "cityscape";
  // Continuous retaining ring around the open drop zone.
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2,
      r = 23,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r,
      h = 24 + random() * 4;
    const m = mesh(
      city ? box : new T.CylinderGeometry(1, 1.3, 1, 5),
      city ? 0x3e4b69 : 0x403746,
      g,
      [x, h / 2 - 1, z],
      city ? [3.2, h, 2.8] : [2.4, h, 2.3],
    );
    m.rotation.y = -a;
    if (city) {
      mesh(box, 0x718297, g, [x, h - 0.4, z], [3.5, 0.32, 3.4]);
      for (let j = 0; j < Math.floor(h / 3); j++)
        mesh(
          box,
          0xd59e4e,
          g,
          [x * 0.967, 2 + j * 3, z * 0.967],
          [0.25, 0.32, 0.25],
          0.55,
        );
    }
  }
  // Open-sided structural corner towers keep the stacked floors legible.
  for (const x of [-15.4, 15.4])
    for (const z of [-15.4, 15.4]) {
      mesh(box, city ? 0x814750 : 0x594651, g, [x, 12, z], [0.42, 25, 0.42]);
      for (const y of LEVELS) {
        mesh(box, C.gold, g, [x, y - 0.7, z], [0.65, 0.34, 0.65]);
        bar(
          g,
          [x, y - 3, z],
          [x - Math.sign(x) * 1.6, y - 0.5, z],
          0.085,
          city ? 0x9b5252 : 0x816343,
        );
      }
      mesh(cylinder, C.iron, g, [x, 25.3, z], [0.53, 0.4, 0.53]);
      mesh(
        new T.IcosahedronGeometry(1, 1),
        C.gold,
        g,
        [x, 25.9, z],
        [0.26, 0.61, 0.26],
        2.1,
      );
    }
  if (!city) {
    for (let i = 0; i < 23; i++) {
      let a = (i / 23) * Math.PI * 2,
        r = 35 + random() * 8,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r,
        h = 16 + random() * 18;
      const mountain = mesh(
        new T.IcosahedronGeometry(1, 1),
        i % 2 ? 0x514051 : 0x604751,
        g,
        [x, h * 0.45 - 3, z],
        [4 + random() * 3, h, 4 + random() * 3],
      );
      mountain.rotation.y = random() * 3;
      for (let j = 0; j < 3; j++)
        mesh(
          new T.IcosahedronGeometry(1, 0),
          0x53414e,
          g,
          [x + (random() - 0.5) * 5, h * 0.35 + j * 2, z],
          [2.2, 3, 2.2],
        );
    }
    // Faceted lavafall channels: animation is added by the runtime shader.
    for (const a of [1.9, 3.1, 4.55]) {
      const x = Math.cos(a) * 21.4,
        z = Math.sin(a) * 21.4;
      mesh(box, 0xff761c, g, [x, 11, z], [1.2, 24, 0.8], 1.5);
      mesh(box, 0xffd658, g, [x * 0.994, 11, z * 0.994], [0.35, 24, 0.3], 2.2);
    }
    for (let i = 0; i < 65; i++) {
      const a = random() * Math.PI * 2,
        r = 18.7 + random() * 2.3;
      mesh(
        new T.IcosahedronGeometry(1, 0),
        0x3b3444,
        g,
        [Math.cos(a) * r, 0.1 + random() * 0.5, Math.sin(a) * r],
        [0.3 + random(), 0.3 + random(), 0.3 + random()],
      );
    }
    // Stacked rock seams break up the crater walls without a texture fetch.
    for (let i = 0; i < 32; i++) {
      let a = (i / 32) * Math.PI * 2,
        x = Math.cos(a) * 21.9,
        z = Math.sin(a) * 21.9;

      for (let j = 0; j < 8; j++) {
        const rock = mesh(
          new T.IcosahedronGeometry(1, 0),
          j % 2 ? 0x514250 : 0x483846,
          g,
          [x, 1 + j * 3, z],
          [1.8, 1.1, 1.3],
        );
        rock.rotation.y = a;
      }
    }
  }
  return bake(g);
}
export function lavaMaterial(fall = false) {
  return new T.ShaderMaterial({
    uniforms: { time: { value: 0 }, fall: { value: fall ? 1 : 0 } },
    vertexShader: `varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 p; uniform float time;uniform float fall;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 vec2 rnd(vec2 p){return vec2(hash(p),hash(p+31.7));}
 float noise(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 void main(){vec2 base=mix(p.xz,p.xy*vec2(2.,.35)+vec2(0.,time*.7),fall);vec2 uv=base*.65;uv+=vec2(noise(uv+time*.12),noise(uv.yx-time*.07))*1.5;vec2 cell=floor(uv),f=fract(uv);float d=9.;float d2=9.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){vec2 q=vec2(float(x),float(y));vec2 r=q+.5+.32*sin(time*.24+6.283*rnd(cell+q))-f;float v=length(r);if(v<d){d2=d;d=v;}else{d2=min(d2,v);}}
 float seam=1.-smoothstep(.012,.17,d2-d);float n=noise(base*1.5+time*.13)*.6+noise(base*4.)*.3;float flow=smoothstep(.2,.8,n);vec3 crust=mix(vec3(.075,.012,.025),vec3(.7,.045,.005),flow);vec3 hot=mix(vec3(1.,.12,.003),vec3(1.,.65,.05),pow(seam,3.));vec3 color=mix(crust,hot,seam)*1.8;gl_FragColor=vec4(color,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
    side: T.DoubleSide,
  });
}
