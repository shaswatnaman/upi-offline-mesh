package com.shaswatnaman.upimesh;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Entry point for the offline UPI mesh demo.
 *
 * Run from terminal:
 *   ./mvnw spring-boot:run        (Linux/Mac)
 *   mvnw.cmd spring-boot:run      (Windows)
 *
 * Then open http://localhost:8080
 */
@SpringBootApplication
@EnableScheduling
public class UpiMeshApplication {
    public static void main(String[] args) {
        SpringApplication.run(UpiMeshApplication.class, args);
    }
}
