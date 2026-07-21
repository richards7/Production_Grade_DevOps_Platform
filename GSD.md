# GSD.md — Production-Grade DevOps Deployment Platform
**Single source of truth for continuing this project.** Any agent or session picking this up should read this file fully before taking any action. Update the "Progress Tracker" section at the bottom after every work session.

Last updated: Day 3 of Phase 2, in progress.

---

## 1. Project Objective

Build a **production-grade CI/CD deployment platform** that demonstrates real DevOps engineering — not a web app project. The application itself (Spring Boot + React) is a deliberately simple payload; the actual subject being demonstrated is:

> **How does a `git push` to `main` become a running, monitored, production application — with zero manual steps?**

Target audience: fresher-level DevOps/Cloud Engineer roles at product-based companies. The project must be defensible in technical interviews — every design decision should have a reason, and real debugging challenges encountered along the way are considered a feature (interview material), not something to hide.

**Owner:** Aashish Richard J (goes by Richard) — final-year B.Tech CS student, Dhaanish Ahmed College of Engineering, Chennai, specializing in Cloud Computing/DevOps (CGPA 8.95). Targeting fresher DevOps/Cloud roles at product-based companies. Also working through AWS Cloud Practitioner (CLF-C02) certification and aptitude prep in parallel — Phase 6 (Terraform/AWS) is intentionally scheduled to overlap with cert study.

---

## 2. Full Scope — Two Stages

**Stage A (current focus):** Local, fully automated pipeline — GitHub webhook → Jenkins → Docker → Trivy → Helm → Kubernetes (Minikube). No cloud, no GitOps yet. Goal: prove the core mechanics work end to end, triggered purely by `git push`.

**Stage B (after Stage A is solid):** ArgoCD (GitOps), Terraform (IaC), AWS (real cloud, EKS), full observability stack (Prometheus, Grafana, Loki), production hardening (RBAC, TLS, autoscaling, backup).

### Full pipeline sequence (Stage A):
```
git push (main) → GitHub webhook → Jenkins triggered
  → compile (mvn compile)
  → test (mvn test / JUnit)
  → SonarQube quality gate
  → package (mvn package → .jar)
  → docker build
  → Trivy image scan (vulnerability gate)
  → docker push (Docker Hub)
  → helm upgrade --install (deploys to Kubernetes — this IS the deploy step, not a separate one)
```

### 30-second description (for resume/interview use):
> "I built a CI/CD deployment platform that automates the entire path from code to production. When a developer pushes to GitHub, a webhook triggers Jenkins, which compiles and tests the code, runs a SonarQube quality gate, builds a Docker image, scans it for vulnerabilities with Trivy, pushes it to Docker Hub, and deploys it to Kubernetes via Helm — completely hands-off. The application itself (Spring Boot + React) is intentionally simple; the real engineering is in the pipeline automation, containerization, and orchestration. I'm currently extending it with ArgoCD for GitOps, Terraform for infrastructure-as-code on AWS, and a full monitoring/logging stack with Prometheus, Grafana, and Loki."

---

## 3. Environment — Verified Working State

**Platform:** WSL2, Ubuntu 24.04, systemd enabled, running on Windows (VS Code connected via WSL extension — always confirm bottom-left VS Code corner shows `WSL: Ubuntu` before working, NOT a plain PowerShell/Windows window).

### Core tools (all verified working)
| Tool | Version/Note |
|---|---|
| Git | 2.53.0 |
| Java | **17.0.19 active** (via `update-alternatives`; JDK 25 also present but not active). `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64` |
| Maven | 3.9.12, building against Java 17 |
| Node.js | v22.22.1 |
| Docker | `docker-ce` (NOT `docker.io`, NOT snap — both were removed after causing conflicts) |
| Minikube | v1.38.1, driver=docker |
| kubectl | v1.36.2 |
| Helm | v3.21.3 |
| Trivy | v0.72.0 |

### Critical environment quirks — DO NOT re-troubleshoot these, just apply the fix
1. **`DOCKER_HOST=unix:///run/docker.sock`** is permanently set in `~/.bashrc`. `/var/run/docker.sock` is unreliable on this WSL instance (the `/var/run` symlink to `/run` intermittently breaks, becoming a real directory instead). Always use the `/run/docker.sock` path directly.
2. **Minikube does not persist across `wsl --shutdown` or Windows reboot.** Always run `minikube start --driver=docker` after either event, before doing anything else.
3. **WSL memory allocation** is set to 12GB in `%USERPROFILE%\.wslconfig` (Windows side) — usable ~11Gi inside WSL. If `free -h` shows ~7.6Gi, `.wslconfig` wasn't applied or `wsl --shutdown` wasn't run from PowerShell.
4. **Three `dockerd` processes running simultaneously is normal**, not a bug: (1) main WSL Docker daemon, (2) Minikube's own internal dockerd (TLS-secured), (3) `cri-dockerd` (K8s→Docker runtime shim). Confirmed expected via process inspection.
5. **Port 8080 is claimed by Jenkins master.** Backend app uses **8081** on host (container-internal stays 8080) to avoid collision. When running the backend via plain `mvn spring-boot:run` (not Docker), explicitly override: `mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8081`.
6. **Never use `--network host` with `docker run` on this backend** — it bypasses `-p` port mapping entirely, causing the exact 8080 collision with Jenkins we're trying to avoid. Use normal `-p 8081:8080` mapping instead.
7. **File structure has an extra nesting layer** on disk: actual project files live at `~/production-devops-platform/production_grade_deployment_project/project/{backend,frontend,docker}/` — not directly under `~/production-devops-platform/`. Always `cd` into the correct depth before running `mvn`/`docker build` commands (this has caused repeated "file not found" errors — check `pwd` and `ls` first if any command claims a file is missing).

### Jenkins setup (Docker Compose, in `~/jenkins-setup/`)
- **Files:** `docker-compose.yaml` (note: `.yaml` not `.yml`) + `Dockerfile` (agent image)
- **Architecture:** `jenkins-master` (official `jenkins/jenkins:lts` image) + `jenkins-agent` (custom image built on `jenkins/inbound-agent:alpine-jdk21`)
- **Agent connects via WebSocket/inbound method, NOT SSH.** This was a deliberate pivot after discovering the agent's modern OpenSSH offers only algorithms Jenkins' bundled SSH client (old Java library) can't negotiate — a genuine compatibility wall, not a shortcut. Connection uses `JENKINS_URL`, `JENKINS_AGENT_NAME`, `JENKINS_SECRET` env vars (secret obtained from Jenkins UI: Manage Jenkins → Nodes → docker-agent → after setting launch method to "Launch agent by connecting it to the controller" → copy ONLY the `-secret` value from the Unix command shown, not the whole shell command).
- **Custom agent image includes:** Docker CLI, Maven, Node.js, kubectl, Helm, Trivy, plus JDK17 installed alongside the base image's JDK21 (JDK21 is used internally by Jenkins' own remoting client; JDK17 is what `mvn` should actually build against — set explicitly per-stage in Jenkinsfile if needed).
- **Docker socket mounted** (`/run/docker.sock:/var/run/docker.sock`) so the agent's `docker build` uses the host's real daemon (no Docker-in-Docker).
- **Kubernetes access:** solved via a **flattened, self-contained kubeconfig** (`kubectl config view --flatten --minify`), server address corrected to Minikube's container IP (find via `docker inspect minikube --format '{{.NetworkSettings.Networks.minikube.IPAddress}}'`, currently `192.168.49.2:8443`), uploaded to Jenkins as a **Secret file credential** (ID: `minikube-kubeconfig`), used in pipelines via `withCredentials([file(credentialsId: 'minikube-kubeconfig', variable: 'KUBECONFIG')])`. Agent container must be connected to Minikube's Docker network (`minikube`) — this should be a permanent entry in `docker-compose.yaml` under the agent service (`networks: [jenkins-net, minikube]` with `minikube: {external: true}` at top level), NOT a manual `docker network connect` (which is lost on container recreate).
- **Docker Hub credentials:** stored in Jenkins as Username/password credential, ID: `dockerhub-creds`. **Important:** Docker Hub username is `richards7` — image tags MUST use this namespace (e.g., `richards7/my-app:N`), not any other placeholder namespace, or pushes fail with `insufficient_scope`.
- **Verification commands** (all confirmed working):
  ```bash
  docker exec -it jenkins-agent docker --version
  docker exec -it jenkins-agent mvn -version
  docker exec -it jenkins-agent node --version
  docker exec -it jenkins-agent kubectl version --client
  docker exec -it jenkins-agent helm version
  docker exec -it jenkins-agent trivy --version
  docker exec -u jenkins -it jenkins-agent kubectl get nodes    # must use -u jenkins, not default root
  ```

### Other running containers (separate from main project — a monitoring learning exercise)
`prometheus`, `grafana`, `flask_app` — a standalone Docker Compose demo (from `Repo-Testing-Account/prometheus-grafana`) used to learn Prometheus/Grafana mechanics with a toy Flask app. **Not connected to the actual project.** Real Phase 5 observability will use `kube-prometheus-stack` via Helm, inside Minikube, monitoring the real Spring Boot backend's `/actuator/prometheus` endpoint.

---

## 4. Application — What's Been Built (Phase 2)

Simple "Students" CRUD app — deliberately minimal, exists only to give the pipeline something real to build/scan/deploy.

**Backend:** Spring Boot 3.3.4, Java 17, Maven. Layers: `controller/StudentController.java`, `service/StudentService.java`, `repository/StudentRepository.java` (JpaRepository, no manual SQL), `model/Student.java` (JPA entity: id, name, course). Config in `application.yml` (local) / `application-docker.yml` (Compose overrides). Dependencies: Spring Web, Spring Data JPA, PostgreSQL driver, Spring Data Redis, Actuator, springdoc-openapi (Swagger UI at `/swagger-ui.html`). Endpoints: `GET/POST /students`, `GET/DELETE /students/{id}`, `GET /actuator/health`, `GET /actuator/prometheus` (metrics, ready for Phase 5).

**Frontend:** React + TypeScript + Vite. `src/api.ts` (all backend calls, points to `http://localhost:8081`), `src/App.tsx` (list + add-student form).

**Docker:** Multi-stage Dockerfiles for both (Maven build → JRE runtime for backend; npm build → nginx serve for frontend). `docker/docker-compose.yml` runs postgres + redis + backend (host port **8081**) + frontend (host port 5173) together.

---

## 5. File Structure (Full Project, All Stages)

```
production-devops-platform/
├── backend/                  # Spring Boot — DONE (Days 1-3 of Phase 2 in progress)
│   ├── src/main/java/com/devopsplatform/backend/
│   │   ├── controller/StudentController.java
│   │   ├── service/StudentService.java
│   │   ├── repository/StudentRepository.java
│   │   ├── model/Student.java
│   │   └── BackendApplication.java
│   ├── src/main/resources/{application.yml, application-docker.yml}
│   ├── src/test/java/.../BackendApplicationTests.java
│   ├── Dockerfile, .dockerignore, pom.xml
├── frontend/                 # React+TS — DONE (Day 4 pending)
│   ├── src/{main.tsx, App.tsx, api.ts}
│   ├── Dockerfile, package.json, vite.config.ts, tsconfig.json
├── docker/
│   └── docker-compose.yml    # DONE — postgres+redis+backend(8081)+frontend
├── jenkins/  (actually lives at ~/jenkins-setup/, separate from main repo currently — consider consolidating)
│   ├── docker-compose.yaml   # DONE
│   └── Dockerfile            # DONE (custom agent image)
├── kubernetes/                # NOT STARTED — Phase 3, Day 6
│   ├── namespace.yaml, deployment.yaml, service.yaml, ingress.yaml, configmap.yaml, secrets.yaml
├── helm/production-platform/  # NOT STARTED — Phase 3, Day 7
│   ├── Chart.yaml, values.yaml, templates/
├── Jenkinsfile                 # NOT STARTED — Phase 3, Days 9-10 (partial testing done via throwaway test-pipeline jobs)
├── argocd/                     # Stage B — not started
├── terraform/                  # Stage B — not started
├── monitoring/                 # Stage B — not started (learning exercise done separately, see Section 3)
├── logging/                    # Stage B — not started
├── docs/
│   ├── decisions.md             # RECOMMENDED: save the "Retrospective" content (Section 7 below) here
├── README.md, LICENSE, .gitignore
```

---

## 6. Full Schedule (Phase by Phase)

~5 weeks, ~28 working days at 2-3 focused hours/day. Full breakdown available in `project-schedule.md` (already generated). Summary:

| Phase | Content | Status |
|---|---|---|
| 1 | Local Foundation (Git, Java, Maven, Node, Docker, Minikube, Helm, Trivy, Jenkins) | ✅ DONE |
| 2 | Application (Spring Boot + React + Postgres + Redis + Swagger + Actuator) | 🔶 IN PROGRESS — Day 3 of 5 |
| 3 | CI/CD Pipeline (raw K8s manifests → Helm chart → SonarQube → Jenkinsfile) | ⬜ NOT STARTED |
| 4 | Webhook automation trigger (GitHub → Jenkins) | ⬜ NOT STARTED |
| 5 | Observability (Prometheus, Grafana, Loki via Helm) | ⬜ NOT STARTED |
| 6 | Cloud & IaC (Terraform + AWS + EKS) | ⬜ NOT STARTED |
| 7 | Production Enhancements (ArgoCD/GitOps, RBAC, TLS, Autoscaling, Backup) | ⬜ NOT STARTED |

**Milestone target:** Stage A (Phases 1-4) fully complete by end of Week 2 — this alone is a strong, demo-able resume artifact.

---

## 7. Key Design Decisions & Challenges (condensed — full version in `project-retrospective.md`)

1. **Docker: two conflicting installs found and removed** (docker.io/snap vs docker-ce) — kept only `docker-ce`.
2. **`/var/run/docker.sock` unreliable on this WSL instance** — routed around via explicit `DOCKER_HOST=unix:///run/docker.sock` rather than fighting the symlink.
3. **Jenkins agent SSH connection hit a real crypto compatibility wall** (modern OpenSSH vs old Jenkins SSH client library) — diagnosed via verbose SSH logs from an isolated test container, then deliberately pivoted to WebSocket/inbound agent connection (Jenkins' own modern recommended approach for this scenario, not a workaround).
4. **Custom agent Docker image build failures** — Helm needed `openssl` explicitly; Trivy needed its official binary installer instead of a missing Alpine package.
5. **Agent container crash-looped on startup** — traced to an unintended `USER jenkins` line overriding the base image's required root-start behavior (needs root to set SSH key permissions before dropping privileges internally).
6. **kubectl-in-agent → Minikube connectivity** — solved in layers: fixed `$HOME` mismatch (root vs jenkins user), generated a flattened/self-contained kubeconfig (no host file-path dependencies), corrected server IP to Minikube's real container address, connected agent to Minikube's Docker network, delivered via Jenkins Secret file credential (production-realistic pattern, not a mounted-file hack).
7. **Docker Hub push failures** — caused by tagging images under a mismatched namespace (`testingacountwork` instead of the actual logged-in account `richards7`) — Docker Hub correctly rejected cross-namespace pushes.

---

## 8. Immediate Next Steps (pick up here)

**Currently on: Phase 2, Day 3** — building/running the backend as a standalone Docker container (not yet via Compose).

1. Confirm `docker build -t backend:local .` succeeds from the correct directory (`~/production-devops-platform/production_grade_deployment_project/project/backend`)
2. Run with correct port mapping (NOT `--network host`): `docker run --rm -p 8081:8080 -e SPRING_PROFILES_ACTIVE=default backend:local`
3. Verify: `curl http://localhost:8081/actuator/health` → expect `"status":"UP"`
4. **Day 4:** run frontend (`npm install && npm run dev`), confirm it calls backend successfully in browser
5. **Day 5:** full `docker compose up -d --build` from `docker/` folder — all 4 services + Jenkins running simultaneously with no port conflicts
6. **Then Phase 3:** raw K8s manifests → Helm chart → SonarQube setup → full Jenkinsfile (checkout → compile/test → SonarQube → package → docker build → Trivy → push to `richards7/...` → `helm upgrade` using `minikube-kubeconfig` credential)

---

## Maintenance Instructions for Future Agent Sessions

- **Update Section 8 ("Immediate Next Steps")** after every work session — this is the actual pointer for where to resume.
- **Update Section 6 (Schedule table status column)** as phases complete.
- **Append new entries to Section 7** if a new significant technical challenge is solved — keep the "what/how found/what we did/why it matters" structure for interview-readiness.
- **Never remove the "Critical environment quirks" list in Section 3** — these are hard-won, permanent facts about this specific machine, not one-time fixes.
- If asked to regenerate supporting docs (schedule, retrospective, environment setup, phase instructions), treat this GSD.md as the merge source of truth — other documents should stay consistent with what's recorded here.
