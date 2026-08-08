# Contributing

Thank you for your interest in contributing.

## Development Setup

```bash
git clone https://github.com/<your-username>/upi-offline-mesh.git
cd upi-offline-mesh

# Linux/Mac
./mvnw spring-boot:run

# Windows
mvnw.cmd spring-boot:run
```

Open http://localhost:8080

## Code Style

- **Standard**: Java 17, Spring Boot 3.x.
- **Injection**: Constructor injection only — no `@Autowired` on fields.
- **Naming**: `camelCase` for methods/variables, `PascalCase` for classes. Package names lowercase.
- **Comments**: Only where the *why* is non-obvious (a security invariant, a workaround, a subtle contract). Don't describe what the code does.
- **Lombok**: Use `@Getter`/`@Setter`/`@NoArgsConstructor`/`@AllArgsConstructor` on entities/DTOs. Avoid `@Data` on JPA entities (equals/hashCode on mutable entities causes Hibernate issues).

## Running Tests

```bash
./mvnw test
```

The key test is `IdempotencyConcurrencyTest#singlePacketDeliveredByThreeBridgesSettlesExactlyOnce` — it fires three threads at the ingestion pipeline simultaneously and asserts exactly one settlement.

## Adding a Feature

1. Fork the repository and create a branch: `git checkout -b feat/my-feature`
2. Keep the scope small — one logical change per PR.
3. Ensure all tests pass: `./mvnw verify`
4. Update `README.md` if the change affects the CLI or architecture.
5. Open the PR against `main`.

## Reporting Issues

Please include:
- JDK version (`java -version`)
- Operating system
- The exact command you ran
- Full terminal output
