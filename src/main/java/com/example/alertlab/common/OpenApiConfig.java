package com.example.alertlab.common;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI alertLabOpenApi() {
        return new OpenAPI().info(new Info()
                .title("n8n-alert-lab API")
                .version("v1")
                .description("""
                        알럿 파이프라인(Grafana → n8n → OpenAI → Slack) 실습용 데모 API.
                        `/scenarios/*` 는 **의도적으로 에러를 발생**시켜 ERROR 로그·메트릭·알럿을 만든다.
                        응답의 `traceId` 로 Loki 에서 같은 요청의 로그를 찾을 수 있다.
                        """));
    }
}
