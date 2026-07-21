// ─────────────────────────────────────────────────────────────────────────────
// Production-Grade DevOps Deployment Platform — Jenkins Pipeline
// ─────────────────────────────────────────────────────────────────────────────
//
// PREREQUISITES (one-time Jenkins setup before running this pipeline):
//
// 1. Plugins required (Manage Jenkins → Plugin Manager → Install):
//    - Pipeline
//    - Docker Pipeline
//    - SonarQube Scanner
//    - JUnit
//    - Credentials Binding
//
// 2. SonarQube server (Manage Jenkins → System → SonarQube servers):
//    Name:        SonarQube
//    Server URL:  http://host.docker.internal:9000
//    Auth Token:  Add → Secret text → paste token from SonarQube UI
//                 (SonarQube UI → My Account → Security → Generate Token)
//    Credential ID: sonarqube-token
//
// 3. Docker Hub credentials (Manage Jenkins → Credentials → Global → Add):
//    Kind:     Username with password
//    Username: richards7
//    Password: Docker Hub access token (NOT your login password)
//    ID:       dockerhub-creds
//
// 4. Jenkins agent (Manage Jenkins → Nodes):
//    Name:          docker-agent
//    Launch method: Launch agent by connecting it to the controller (WebSocket)
//    This agent must have: docker-cli, maven, kubectl, helm, trivy, openjdk17
//    (configured per ~/jenkins-setup/Dockerfile)
//
// 5. Minikube kubeconfig path fix (run once in WSL if helm deploy fails):
//    The Jenkins agent mounts ~/.kube and ~/.minikube from the WSL host.
//    If kubeconfig cert paths reference /home/richard but agent expects /home/jenkins:
//      sed -i 's|/home/richard/.minikube|/home/jenkins/.minikube|g' ~/.kube/config
//    Then restart: docker compose -f ~/jenkins-setup/docker-compose.yml restart jenkins-agent
//
// ─────────────────────────────────────────────────────────────────────────────

pipeline {

    // Target the Docker agent that has all tools (docker, maven, kubectl, helm, trivy)
    agent { label 'docker-agent' }

    environment {
        // ── Image configuration ──────────────────────────────────────────────
        DOCKER_HUB_USER   = 'richards7'
        BACKEND_IMAGE     = 'richards7/backend'
        FRONTEND_IMAGE    = 'richards7/frontend'
        // BUILD_NUMBER is injected by Jenkins automatically — gives each build
        // a unique, traceable, immutable image tag (e.g. backend:42)
        IMAGE_TAG         = "${BUILD_NUMBER}"

        // ── Helm / Kubernetes configuration ──────────────────────────────────
        HELM_RELEASE      = 'production-platform'
        HELM_CHART        = './helm/production-platform'
        HELM_NAMESPACE    = 'devops-platform'

        // ── SonarQube ─────────────────────────────────────────────────────────
        // Server name matches what's configured in Manage Jenkins → System
        SONARQUBE_SERVER  = 'SonarQube'
    }

    options {
        // Keep last 10 builds — avoids disk fill-up on Minikube dev host
        buildDiscarder(logRotator(numToKeepStr: '10'))
        // Fail the pipeline if it hangs for more than 30 minutes
        timeout(time: 30, unit: 'MINUTES')
        // Print timestamps in the log — makes debugging much easier
        timestamps()
    }

    stages {

        // ── Stage 1: Checkout ─────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                // Pull the latest code from the branch that triggered the build.
                // When webhook is configured (Phase 4), this will be the pushed commit.
                checkout scm
                echo "Building commit: ${GIT_COMMIT?.take(7) ?: 'unknown'} on branch: ${GIT_BRANCH}"
            }
        }

        // ── Stage 2: Compile ──────────────────────────────────────────────────
        stage('Compile') {
            steps {
                dir('backend') {
                    // -B = batch mode: no progress bars, cleaner CI output
                    sh 'mvn compile -B'
                }
            }
        }

        // ── Stage 3: Test ─────────────────────────────────────────────────────
        stage('Test') {
            steps {
                dir('backend') {
                    sh 'mvn test -B'
                }
            }
            post {
                // Publish JUnit results regardless of pass/fail so Jenkins
                // shows the test trend graph and marks failed tests clearly
                always {
                    junit 'backend/target/surefire-reports/*.xml'
                }
            }
        }

        // ── Stage 4: SonarQube Scan + Quality Gate ────────────────────────────
        stage('SonarQube Scan') {
            steps {
                // withSonarQubeEnv injects SONAR_HOST_URL and SONAR_AUTH_TOKEN
                // automatically from the Jenkins SonarQube server configuration.
                // No need to hardcode the token anywhere in this file.
                withSonarQubeEnv("${SONARQUBE_SERVER}") {
                    dir('backend') {
                        sh """
                            mvn org.sonarsource.scanner.maven:sonar-maven-plugin:sonar \
                                -Dsonar.projectKey=production-devops-platform \
                                -Dsonar.projectName='Production DevOps Platform' \
                                -Dsonar.qualitygate.wait=true \
                                -B
                        """
                        // sonar.qualitygate.wait=true: Maven itself polls SonarQube
                        // and exits non-zero if the quality gate fails.
                        // No separate waitForQualityGate step needed.
                    }
                }
            }
        }

        // ── Stage 5: Package ──────────────────────────────────────────────────
        stage('Package') {
            steps {
                dir('backend') {
                    // -DskipTests: tests already ran in Stage 3, no need to repeat
                    sh 'mvn package -DskipTests -B'
                    // Confirm the jar was built — useful in logs
                    sh 'ls -lh target/*.jar'
                }
            }
        }

        // ── Stage 6: Docker Build ─────────────────────────────────────────────
        stage('Docker Build') {
            steps {
                // Build backend image using the multi-stage Dockerfile in backend/
                sh "docker build -t ${BACKEND_IMAGE}:${IMAGE_TAG} ./backend"

                // Build frontend image — npm install + Vite build + nginx:alpine
                sh "docker build -t ${FRONTEND_IMAGE}:${IMAGE_TAG} ./frontend"

                echo "Built images: ${BACKEND_IMAGE}:${IMAGE_TAG} and ${FRONTEND_IMAGE}:${IMAGE_TAG}"
            }
        }

        // ── Stage 7: Trivy Vulnerability Scan ────────────────────────────────
        stage('Trivy Scan') {
            steps {
                // --exit-code 1: fail the pipeline if CRITICAL CVEs are found
                // --severity CRITICAL: only block on critical, not high/medium
                //   (Spring Boot transitive deps have known HIGH CVEs that are
                //    not exploitable in this context — blocking on HIGH would
                //    stall the pipeline permanently)
                // --no-progress: cleaner CI log output
                // --ignore-unfixed: skip CVEs with no available fix yet

                sh """
                    trivy image \
                        --exit-code 1 \
                        --severity CRITICAL \
                        --no-progress \
                        --ignore-unfixed \
                        ${BACKEND_IMAGE}:${IMAGE_TAG}
                """

                sh """
                    trivy image \
                        --exit-code 1 \
                        --severity CRITICAL \
                        --no-progress \
                        --ignore-unfixed \
                        ${FRONTEND_IMAGE}:${IMAGE_TAG}
                """

                echo "Trivy scan passed — no CRITICAL unfixed CVEs found."
            }
        }

        // ── Stage 8: Docker Push ──────────────────────────────────────────────
        stage('Docker Push') {
            steps {
                // withCredentials pulls the Docker Hub username and token
                // from the Jenkins credential store (ID: dockerhub-creds)
                // — the token never appears in this file or in the build log
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh 'echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin'
                    sh "docker push ${BACKEND_IMAGE}:${IMAGE_TAG}"
                    sh "docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}"
                }

                echo "Pushed: ${BACKEND_IMAGE}:${IMAGE_TAG} and ${FRONTEND_IMAGE}:${IMAGE_TAG}"
            }
        }

        // ── Stage 9: Helm Deploy to Kubernetes ───────────────────────────────
        stage('Helm Deploy') {
            steps {
                // helm upgrade --install:
                //   - If the release doesn't exist → creates it (install)
                //   - If it does exist → upgrades it (rolling update)
                //
                // --set overrides image tags so Kubernetes pulls the exact
                //   image built and scanned in this pipeline run, not "latest"
                //
                // --wait: Helm waits until all pods are Ready before returning.
                //   If pods crash or fail health checks, the stage fails here
                //   (not silently after Jenkins marks the build green).
                //
                // --timeout 5m: give the Spring Boot pod time to reach
                //   /actuator/health (initialDelaySeconds: 30)

                sh """
                    helm upgrade --install ${HELM_RELEASE} ${HELM_CHART} \
                        --namespace ${HELM_NAMESPACE} \
                        --create-namespace \
                        --set backend.image.tag=${IMAGE_TAG} \
                        --set frontend.image.tag=${IMAGE_TAG} \
                        --wait \
                        --timeout 5m
                """

                // Confirm what's now running in the cluster
                sh "kubectl get pods -n ${HELM_NAMESPACE}"
                sh "kubectl get ingress -n ${HELM_NAMESPACE}"

                echo "Deployment complete — image tag: ${IMAGE_TAG}"
                echo "Access: http://devops-platform.local  (after kubectl port-forward svc/backend 8080:8080 -n ${HELM_NAMESPACE} for API calls)"
            }
        }
    }

    post {
        always {
            // Always log out of Docker Hub — prevents credential leakage
            // if the agent container is reused across builds
            sh 'docker logout || true'
        }

        success {
            echo """
            ╔══════════════════════════════════════════════════════════╗
            ║  Pipeline PASSED — Build #${BUILD_NUMBER}
            ║  git push → compile → test → quality gate → package
            ║           → docker build → trivy scan → push → deploy
            ║  App is live on Minikube with image tag: ${IMAGE_TAG}
            ╚══════════════════════════════════════════════════════════╝
            """.stripIndent()
        }

        failure {
            echo """
            ╔══════════════════════════════════════════════════════════╗
            ║  Pipeline FAILED — Build #${BUILD_NUMBER}
            ║  Check the stage logs above for the root cause.
            ║  Common causes:
            ║    Stage 3 (Test)     → JUnit failure in backend code
            ║    Stage 4 (Sonar)   → Quality gate blocked (fix code smells)
            ║    Stage 7 (Trivy)   → New CRITICAL CVE in base image
            ║    Stage 9 (Helm)    → Pod crash / readiness probe timeout
            ╚══════════════════════════════════════════════════════════╝
            """.stripIndent()
        }
    }
}
