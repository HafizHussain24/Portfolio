import * as THREE from 'three';

export function createJokerCard3D(): THREE.Group {
  const group = new THREE.Group();

  // Helper for flat colored materials
  const flat = (color: number) => new THREE.MeshBasicMaterial({ color });

  // 1. Card Base (White)
  const baseGeo = new THREE.BoxGeometry(2.4, 3.4, 0.05);
  const baseMat = flat(0xf4f4f4);
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  group.add(baseMesh);

  // 2. Black Jagged Border Layer (slightly in front)
  const borderGeo = new THREE.PlaneGeometry(2.1, 3.1);
  const borderMat = flat(0x111111);
  const borderMesh = new THREE.Mesh(borderGeo, borderMat);
  borderMesh.position.z = 0.026;
  group.add(borderMesh);

  // 3. Yellow Inner Layer
  const yellowGeo = new THREE.PlaneGeometry(1.9, 2.9);
  const yellowMat = flat(0xeab83f);
  const yellowMesh = new THREE.Mesh(yellowGeo, yellowMat);
  yellowMesh.position.z = 0.027;
  group.add(yellowMesh);

  // 4. Joker Face Group
  const faceGroup = new THREE.Group();
  faceGroup.position.z = 0.028;
  group.add(faceGroup);

  // Hair Back (Black)
  const hairGeo = new THREE.PlaneGeometry(1.4, 1.2);
  const hairMesh = new THREE.Mesh(hairGeo, flat(0x111111));
  hairMesh.position.set(0, 0.6, 0);
  faceGroup.add(hairMesh);

  // Hair points (Left and right swoops)
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flat(0x111111));
  p1.position.set(-0.7, 0.7, 0);
  p1.rotation.z = 0.5;
  faceGroup.add(p1);

  const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flat(0x111111));
  p2.position.set(0.7, 0.7, 0);
  p2.rotation.z = -0.5;
  faceGroup.add(p2);

  // Green Hair Highlight
  const greenGeo = new THREE.PlaneGeometry(0.5, 0.2);
  const greenMesh = new THREE.Mesh(greenGeo, flat(0x007a53));
  greenMesh.position.set(0, 0.9, 0.001);
  faceGroup.add(greenMesh);

  // White Face Base (Long chin)
  const faceBaseGeo = new THREE.PlaneGeometry(1.0, 1.5);
  const faceBaseMesh = new THREE.Mesh(faceBaseGeo, flat(0xffffff));
  faceBaseMesh.position.set(0, -0.1, 0.001);
  faceGroup.add(faceBaseMesh);
  
  // Pointy Chin (Triangle using rotated box)
  const chinGeo = new THREE.PlaneGeometry(0.7, 0.7);
  const chinMesh = new THREE.Mesh(chinGeo, flat(0xffffff));
  chinMesh.position.set(0, -0.65, 0.001);
  chinMesh.rotation.z = Math.PI / 4;
  faceGroup.add(chinMesh);

  // Brow Ridge
  const browGeo = new THREE.PlaneGeometry(0.8, 0.15);
  const browMesh = new THREE.Mesh(browGeo, flat(0x111111));
  browMesh.position.set(0, 0.3, 0.002);
  faceGroup.add(browMesh);

  // Eyes (Small black dots under brow)
  const eyeL = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.05), flat(0x111111));
  eyeL.position.set(-0.2, 0.2, 0.002);
  faceGroup.add(eyeL);

  const eyeR = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.05), flat(0x111111));
  eyeR.position.set(0.2, 0.2, 0.002);
  faceGroup.add(eyeR);

  // Nose (Black line)
  const nose = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.3), flat(0x111111));
  nose.position.set(0, 0.0, 0.002);
  faceGroup.add(nose);

  // Huge Red Smile
  const smileGeo = new THREE.PlaneGeometry(0.9, 0.4);
  const smileMesh = new THREE.Mesh(smileGeo, flat(0x90001a));
  smileMesh.position.set(0, -0.35, 0.002);
  faceGroup.add(smileMesh);

  // White Teeth block inside smile
  const teethGeo = new THREE.PlaneGeometry(0.75, 0.25);
  const teethMesh = new THREE.Mesh(teethGeo, flat(0xffffff));
  teethMesh.position.set(0, -0.35, 0.003);
  faceGroup.add(teethMesh);

  // Teeth vertical lines
  for (let i = -0.3; i <= 0.3; i += 0.15) {
    const toothLine = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.25), flat(0x111111));
    toothLine.position.set(i, -0.35, 0.004);
    faceGroup.add(toothLine);
  }
  
  // Teeth horizontal line
  const hLine = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.02), flat(0x111111));
  hLine.position.set(0, -0.35, 0.004);
  faceGroup.add(hLine);

  return group;
}
