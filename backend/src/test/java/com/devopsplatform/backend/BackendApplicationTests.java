package com.devopsplatform.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

// A minimal test — just confirms the whole application can start up without errors.
// Jenkins will run this in the "test" stage of your pipeline.
@SpringBootTest
class BackendApplicationTests {

    @Test
    void contextLoads() {
        // If the Spring app context fails to start, this test fails automatically.
    }
}
