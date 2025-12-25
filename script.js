let playerName = "";
let localLeaderboard = [{ name: "BouncerX", score: 850 }, { name: "ProShot", score: 520 }];
let gameState = { points: 0, ballsRemaining: 10, isGameRunning: false };

const GRAVITY = -0.005;
const RESTITUTION = 0.6;
const BALL_RADIUS = 0.16;

let scene, camera, renderer, aimBall, groundPlane, stars;
let activeBalls = []; 
let targetCups = [];
let particles = [];
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let currentVelocity = new THREE.Vector3();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 8, 11);
  camera.lookAt(0, 0, -2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById("game-container").appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const light = new THREE.PointLight(0xf97316, 2.5, 40);
  light.position.set(0, 10, 5);
  scene.add(light);

  createWorld();
  setupEvents();
  animate();
}

function createWorld() {
  groundPlane = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 25), new THREE.MeshPhongMaterial({ color: 0x0f172a }));
  groundPlane.position.y = -0.1;
  scene.add(groundPlane);

  const starGeo = new THREE.BufferGeometry();
  const starVerts = [];
  for (let i = 0; i < 2000; i++) starVerts.push((Math.random()-0.5)*120, (Math.random()-0.5)*120, (Math.random()-0.5)*120);
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
  stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 }));
  scene.add(stars);

  const cupGeo = new THREE.CylinderGeometry(0.38, 0.28, 0.7, 16);
  const rows = [5, 4, 3, 2, 1];
  rows.forEach((count, rowIndex) => {
    const z = 2 - rowIndex * 1.4;
    const startX = -((count - 1) * 1.4) / 2;
    for (let i = 0; i < count; i++) {
      const color = rowIndex === 4 ? 0xfacc15 : (rowIndex > 1 ? 0xef4444 : 0x22c55e);
      const cup = new THREE.Mesh(cupGeo, new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.2 }));
      cup.position.set(startX + i * 1.4, 0.35, z);
      cup.name = rowIndex === 4 ? "gold" : "normal";
      scene.add(cup);
      targetCups.push(cup);
    }
  });
}

function animate() {
  requestAnimationFrame(animate);
  if (stars) stars.rotation.y += 0.0002;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.position.add(p.velocity);
    p.life -= 0.02;
    p.scale.setScalar(p.life);
    if (p.life <= 0) { scene.remove(p); particles.splice(i, 1); }
  }

  for (let i = activeBalls.length - 1; i >= 0; i--) {
    const b = activeBalls[i];
    b.velocity.y += GRAVITY;
    b.position.add(b.velocity);
    
    // Table Collision (Bouncing Mechanic)
    if (b.position.y <= BALL_RADIUS) {
      b.position.y = BALL_RADIUS;
      b.velocity.y *= -RESTITUTION;
      b.velocity.x *= 0.96;
      b.velocity.z *= 0.96;
    }

    let removed = false;
    for (let cup of targetCups) {
      const dist = Math.sqrt(Math.pow(b.position.x - cup.position.x, 2) + Math.pow(b.position.z - cup.position.z, 2));
      if (dist < 0.32 && b.position.y < 0.8 && b.position.y > 0.3) {
        gameState.points += (cup.name === "gold" ? 100 : 30);
        document.getElementById("points-display").textContent = gameState.points;
        createExplosion(cup.position, cup.material.color);
        scene.remove(b);
        activeBalls.splice(i, 1);
        removed = true;
        break;
      }
    }
    if (!removed && (b.position.z < -15 || b.position.y < -5 || b.velocity.length() < 0.002)) {
      scene.remove(b);
      activeBalls.splice(i, 1);
    }
  }

  if (gameState.ballsRemaining === 0 && activeBalls.length === 0 && gameState.isGameRunning) {
    gameState.isGameRunning = false;
    setTimeout(showEndScreen, 800);
  }
  renderer.render(scene, camera);
}

function setupEvents() {
  document.getElementById("start-game-btn").onclick = () => {
    const input = document.getElementById("player-name-input");
    if (!playerName) {
      if (!input.value.trim()) return alert("Enter a nickname!");
      playerName = input.value.trim();
      document.getElementById("display-name").textContent = playerName;
    }
    document.getElementById("message-screen").classList.add("hidden");
    document.getElementById("tutorial-screen").classList.remove("hidden");
  };
  document.getElementById("confirm-start-btn").onclick = () => {
    document.getElementById("tutorial-screen").classList.add("hidden");
    resetGameplayState();
    gameState.isGameRunning = true;
    spawnAimBall();
  };
  document.getElementById("exit-game-btn").onclick = exitToMainMenu;
  document.getElementById("leaderboard-btn").onclick = showLeaderboard;
  document.getElementById("close-modal-btn").onclick = () => document.getElementById("modal-container").classList.add("hidden");

  window.addEventListener("mousemove", (e) => {
    if (!gameState.isGameRunning) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(groundPlane);
    if (hits.length > 0 && aimBall) {
      const dx = hits[0].point.x - aimBall.position.x;
      const dz = hits[0].point.z - aimBall.position.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      currentVelocity.set(dx * 0.045, 0.18 + (dist * 0.018), dz * 0.048);
    }
  });
  window.addEventListener("mousedown", () => {
    if (gameState.isGameRunning && gameState.ballsRemaining > 0) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 16, 16), new THREE.MeshPhongMaterial({ color: 0xffffff }));
      b.position.set(0, BALL_RADIUS + 0.1, 6);
      b.velocity = currentVelocity.clone();
      scene.add(b);
      activeBalls.push(b);
      gameState.ballsRemaining--;
      document.getElementById("balls-display").textContent = gameState.ballsRemaining;
      if (gameState.ballsRemaining === 0 && aimBall) { scene.remove(aimBall); aimBall = null; }
    }
  });
}

function exitToMainMenu() {
  playerName = "";
  gameState.isGameRunning = false;
  document.getElementById("display-name").textContent = "Guest Player";
  document.getElementById("player-name-input").value = "";
  document.getElementById("message-text").innerHTML = "Ready to test your aim?";
  document.getElementById("start-game-btn").textContent = "START GAME";
  document.getElementById("name-entry-container").classList.remove("hidden");
  document.getElementById("exit-game-btn").classList.add("hidden");
  resetGameplayState();
}

function resetGameplayState() {
  gameState.points = 0;
  gameState.ballsRemaining = 10;
  document.getElementById("points-display").textContent = "0";
  document.getElementById("balls-display").textContent = "10";
  document.getElementById("rank-indicator").textContent = "";
  activeBalls.forEach(b => scene.remove(b));
  activeBalls = [];
  if(aimBall) { scene.remove(aimBall); aimBall = null; }
}

function showEndScreen() {
  const rank = updateRank();
  document.getElementById("message-text").innerHTML = `
    <div class="text-7xl font-black text-white mb-2">${gameState.points}</div>
    <div class="text-yellow-400 font-black tracking-widest text-xl mb-4">RANK #${rank}</div>
    <div class="text-white opacity-80">Game Over! Play again or Exit?</div>
  `;
  document.getElementById("name-entry-container").classList.add("hidden");
  document.getElementById("start-game-btn").textContent = "CONTINUE";
  document.getElementById("exit-game-btn").classList.remove("hidden");
  document.getElementById("message-screen").classList.remove("hidden");
}

function updateRank() {
  if (gameState.points >= 450) {
    if (gameState.points >= 1000) return 1;
    if (gameState.points >= 800) return 2;
    if (gameState.points >= 650) return 3;
    if (gameState.points >= 550) return 4;
    return 5;
  } else {
    return Math.floor(Math.random() * (99 - 10 + 1)) + 10;
  }
}

function spawnAimBall() {
  if (aimBall) scene.remove(aimBall);
  aimBall = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 16, 16), new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
  aimBall.position.set(0, BALL_RADIUS + 0.1, 6);
  scene.add(aimBall);
}

function createExplosion(pos, color) {
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), new THREE.MeshBasicMaterial({ color }));
    p.position.copy(pos);
    p.velocity = new THREE.Vector3((Math.random()-0.5)*0.2, Math.random()*0.3, (Math.random()-0.5)*0.2);
    p.life = 1.0;
    scene.add(p);
    particles.push(p);
  }
}

function showLeaderboard() {
  const sorted = [...localLeaderboard].sort((a,b)=>b.score-a.score).slice(0,5);
  let html = "";
  sorted.forEach((e, i) => { html += `<div class="flex justify-between p-3 border-b border-white/10"><span>#${i+1} ${e.name}</span><span class="text-orange-400 font-bold">${e.score}</span></div>`; });
  document.getElementById("modal-content").innerHTML = html;
  document.getElementById("modal-container").classList.remove("hidden");
}

init();