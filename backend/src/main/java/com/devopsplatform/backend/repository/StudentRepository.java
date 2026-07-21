package com.devopsplatform.backend.repository;

import com.devopsplatform.backend.model.Student;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

// This is the ONLY file needed to talk to the database.
// Extending JpaRepository automatically gives you save(), findAll(), findById(), deleteById() — no SQL needed.
@Repository
public interface StudentRepository extends JpaRepository<Student, Long> {
}
