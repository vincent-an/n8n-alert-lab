# syntax=docker/dockerfile:1
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY . .
# .git 도 함께 복사되므로 git.properties(커밋 SHA) 가 생성된다
RUN --mount=type=cache,target=/root/.gradle \
    sh ./gradlew bootJar --no-daemon -x test

FROM eclipse-temurin:21-jre
WORKDIR /app
ENV TZ=Asia/Seoul LOG_PATH=/app/logs
COPY --from=build /src/build/libs/*-SNAPSHOT.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
