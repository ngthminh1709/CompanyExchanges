pipeline {
    agent any
    environment {
        registryUrl = "https://index.docker.io/v1/"
        credentialsId = "DOCKER_CE_HUB"
        VERSION = sh(returnStdout: true, script: "cat package.json | jq -r '.version'").trim()
    }
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Get version') {
            steps {
                script {
                    echo "Version: $VERSION"
                }
            }
        }

        stage('Compress Code') {
            steps {
                sh 'chmod +x ./compress.sh && ./compress.sh'
            }
        }

//         stage('Build and Push Docker Image') {
//             steps {
//                 script {
//                     withDockerRegistry([credentialsId: credentialsId, url: registryUrl]) {
//                         def dockerImage = docker.build("ngthminhdev/stock-docker-hub:${VERSION}", "./docker")
//                         dockerImage.push()
//                     }
//                 }
//             }
//         }

        stage('Deploy to 192.168.7.20') {
            steps {
                script {
                    echo "Version1: $VERSION"
                    echo "Version2: ${VERSION}"
                    sh 'ls -l'
//                     sh 'export TAG=0.0.67 && cd /home/beta/services/b-infor-backend && ./deploy.sh'
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
    }
}