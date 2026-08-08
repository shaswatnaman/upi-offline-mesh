package com.shaswatnaman.upimesh.repository;

import com.shaswatnaman.upimesh.model.Account;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountRepository extends JpaRepository<Account, String> {
}
