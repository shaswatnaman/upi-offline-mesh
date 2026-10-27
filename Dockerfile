FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
# Copy pom.xml first so dependency layer is cached unless pom.xml changes
COPY pom.xml .
RUN mvn dependency:go-offline --no-transfer-progress
COPY src ./src
RUN mvn package -DskipTests --no-transfer-progress

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/upi-offline-mesh-1.0.0.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
