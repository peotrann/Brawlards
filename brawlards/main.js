import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ====================================
// SCENE SETUP
// ====================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 100, 500);

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    10000
);
camera.position.set(0, 15, 20);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const appDiv = document.getElementById('app');
if (appDiv.children.length > 0) {
    appDiv.insertBefore(renderer.domElement, appDiv.children[0]);
} else {
    appDiv.appendChild(renderer.domElement);
}

// ====================================
// PHYSICS WORLD
// ====================================
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.defaultContactMaterial.friction = 0.3;

// ====================================
// LIGHTS
// ====================================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.far = 50;
scene.add(directionalLight);

const pointLight = new THREE.PointLight(0x64c8ff, 0.5);
pointLight.position.set(0, 10, 0);
scene.add(pointLight);

// ====================================
// FLOOR
// ====================================
const floorGeometry = new THREE.PlaneGeometry(100, 100);
const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.8,
    metalness: 0.2
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const floorBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Plane(),
    linearDamping: 0.3,
    angularDamping: 0.3
});
floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(floorBody);

// ====================================
// POOL TABLE
// ====================================
const tableGeometry = new THREE.BoxGeometry(10, 0.3, 5);
const tableMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d5016,
    roughness: 0.7
});
const table = new THREE.Mesh(tableGeometry, tableMaterial);
table.position.y = 0.2;
table.castShadow = true;
table.receiveShadow = true;
scene.add(table);

const tableBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(5, 0.15, 2.5))
});
tableBody.position.set(0, 0.2, 0);
world.addBody(tableBody);

// ====================================
// CREATE POOL BALLS
// ====================================
const balls = [];
const ballRadius = 0.15;
const ballMaterial = new THREE.MeshStandardMaterial({
    metalness: 0.3,
    roughness: 0.3
});

// Cue ball (white)
const cueBallGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
const cueBallMesh = new THREE.Mesh(cueBallGeometry, 
    new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.3,
        roughness: 0.3
    })
);
cueBallMesh.position.set(-3, 0.5, 0);
cueBallMesh.castShadow = true;
cueBallMesh.receiveShadow = true;
scene.add(cueBallMesh);

const cueBallBody = new CANNON.Body({
    mass: 1,
    shape: new CANNON.Sphere(ballRadius),
    linearDamping: 0.2,
    angularDamping: 0.2
});
cueBallBody.position.copy(cueBallMesh.position);
world.addBody(cueBallBody);
balls.push({ mesh: cueBallMesh, body: cueBallBody });

// Colored balls (triangle rack)
const colors = [
    0xff0000, 0x00ff00, 0x0000ff, 0xffff00,
    0xff00ff, 0x00ffff, 0xffa500, 0xff6347,
    0x4169e1, 0x32cd32, 0xdc143c, 0x1e90ff,
    0xff8c00, 0x00ced1, 0xb22222
];

let ballIndex = 0;
for (let row = 0; row < 4; row++) {
    for (let col = 0; col <= row; col++) {
        const x = 3 + row * 0.35;
        const z = (col - row / 2) * 0.35;
        
        const ballMesh = new THREE.Mesh(cueBallGeometry, 
            new THREE.MeshStandardMaterial({
                color: colors[ballIndex % colors.length],
                metalness: 0.3,
                roughness: 0.3
            })
        );
        ballMesh.position.set(x, 0.5, z);
        ballMesh.castShadow = true;
        ballMesh.receiveShadow = true;
        scene.add(ballMesh);

        const ballBody = new CANNON.Body({
            mass: 1,
            shape: new CANNON.Sphere(ballRadius),
            linearDamping: 0.2,
            angularDamping: 0.2
        });
        ballBody.position.copy(ballMesh.position);
        world.addBody(ballBody);
        balls.push({ mesh: ballMesh, body: ballBody });
        
        ballIndex++;
    }
}

// ====================================
// GAME LOGIC
// ====================================
let gameActive = true;
let ballSelected = 0;
let shootPower = 0;
let isShooting = false;

// ====================================
// INPUT HANDLING
// ====================================
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    
    if (e.key === ' ') {
        isShooting = true;
        e.preventDefault();
    }
    if (e.key === 'r') {
        resetGame();
    }
    if (e.key === 'ArrowLeft') {
        ballSelected = (ballSelected - 1 + balls.length) % balls.length;
    }
    if (e.key === 'ArrowRight') {
        ballSelected = (ballSelected + 1) % balls.length;
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    
    if (e.key === ' ' && isShooting) {
        // Shoot
        const ball = balls[ballSelected];
        const force = shootPower * 50;
        const direction = new CANNON.Vec3(1, 0, 0);
        direction.vadd(ball.body.velocity, ball.body.velocity);
        ball.body.velocity.x += force;
        
        isShooting = false;
        shootPower = 0;
    }
});

function resetGame() {
    balls.forEach(ball => {
        world.removeBody(ball.body);
    });
    
    balls.length = 0;
    scene.children = scene.children.filter(child => 
        child !== floor && child !== table && child !== ambientLight && 
        child !== directionalLight && child !== pointLight
    );
    
    location.reload();
}

// ====================================
// ANIMATION LOOP
// ====================================
const clock = new THREE.Clock();
let stats = {
    fps: 0,
    ballCount: 0,
    ballVelocity: 0
};

function animate() {
    requestAnimationFrame(animate);
    
    const delta = Math.min(clock.getDelta(), 0.016);
    world.step(1 / 60, delta, 3);
    
    // Update ball positions
    balls.forEach((ball, i) => {
        ball.mesh.position.copy(ball.body.position);
        ball.mesh.quaternion.copy(ball.body.quaternion);
        
        // Reset if ball falls off table
        if (ball.mesh.position.y < -10) {
            ball.mesh.position.set(Math.random() * 10 - 5, 0.5, Math.random() * 5 - 2.5);
            ball.body.position.copy(ball.mesh.position);
            ball.body.velocity.set(0, 0, 0);
            ball.body.angularVelocity.set(0, 0, 0);
        }
    });
    
    // Update camera to follow cue ball
    const cueBall = balls[0];
    camera.position.lerp(
        new THREE.Vector3(cueBall.mesh.position.x, 15, cueBall.mesh.position.z + 20),
        0.05
    );
    camera.lookAt(cueBall.mesh.position.x, 1, cueBall.mesh.position.z);
    
    // Update shooting power
    if (isShooting && shootPower < 1) {
        shootPower += 0.02;
    }
    
    // Update stats
    stats.fps = Math.round(1 / delta);
    stats.ballCount = balls.length;
    stats.ballVelocity = balls[ballSelected]?.body.velocity.length() || 0;
    
    updateUI();
    renderer.render(scene, camera);
}

function updateUI() {
    const uiDiv = document.getElementById('ui');
    if (!uiDiv) return; // Nếu element không tồn tại, bỏ qua
    
    const infoPanel = uiDiv.querySelector('.info-panel') || createInfoPanel();
    const statsDiv = uiDiv.querySelector('.stats') || createStatsDiv();
    
    infoPanel.innerHTML = `
        <h2>🎱 Brawlards</h2>
        <p>Ball: ${ballSelected + 1}/${balls.length}</p>
        <p>Power: ${(shootPower * 100).toFixed(0)}%</p>
        <p>Velocity: ${stats.ballVelocity.toFixed(2)}</p>
    `;
    statsDiv.innerHTML = `
        <div>FPS: ${stats.fps}</div>
        <div>Bodies: ${stats.ballCount}</div>
    `;
}

function createInfoPanel() {
    const uiDiv = document.getElementById('ui');
    const panel = document.createElement('div');
    panel.className = 'info-panel';
    uiDiv.appendChild(panel);
    return panel;
}

function createStatsDiv() {
    const uiDiv = document.getElementById('ui');
    const stats = document.createElement('div');
    stats.className = 'stats';
    uiDiv.appendChild(stats);
    return stats;
}

// ====================================
// WINDOW RESIZE
// ====================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start animation
animate();
