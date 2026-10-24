package gov.irs.directfile.api.errors;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.RequestDispatcher;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.web.ErrorProperties;
import org.springframework.boot.autoconfigure.web.ServerProperties;
import org.springframework.boot.autoconfigure.web.servlet.error.BasicErrorController;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.PropertySourcesPlaceholdersResolver;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.web.servlet.error.DefaultErrorAttributes;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.method.HandlerMethod;

import gov.irs.directfile.api.audit.AuditEventContextHolder;
import gov.irs.directfile.api.audit.AuditLogElement;
import gov.irs.directfile.api.audit.AuditService;
import gov.irs.directfile.api.audit.Auditable;
import gov.irs.directfile.api.config.AopConfiguration;
import gov.irs.directfile.api.events.Event;
import gov.irs.directfile.api.events.EventId;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Exception text can carry return data, so none of the 400 body for invalid data, the audit detail recorded for a
 * failed auditable method, or the default error response echoes it. Each test plants a sentinel in the exception
 * message and asserts that it reaches none of them, and that the capture being checked is not empty.
 */
class ExceptionTextNotEchoedTest {
    static final String SENTINEL = "exception-text-sentinel-7351";

    final ObjectMapper objectMapper = new ObjectMapper();
    final Logger handlerLogger = (Logger) LoggerFactory.getLogger(ValidationExceptionHandlers.class);
    final ListAppender<ILoggingEvent> logAppender = new ListAppender<>();

    static class AuditedTarget {
        @Auditable(event = EventId.TAX_RETURN_CREATE)
        public void create() {}
    }

    @BeforeEach
    void setUp() {
        logAppender.start();
        handlerLogger.addAppender(logAppender);
    }

    @AfterEach
    void tearDown() {
        handlerLogger.detachAppender(logAppender);
        logAppender.stop();
    }

    static Method auditedMethod() throws NoSuchMethodException {
        return AuditedTarget.class.getMethod("create");
    }

    void assertLogsCarryNoSentinel(String expectedClassName) {
        assertFalse(logAppender.list.isEmpty(), "expected at least one captured log line");
        boolean classLogged = false;
        for (ILoggingEvent event : logAppender.list) {
            StringBuilder text = new StringBuilder(event.getFormattedMessage());
            for (IThrowableProxy proxy = event.getThrowableProxy(); proxy != null; proxy = proxy.getCause()) {
                text.append(' ').append(proxy.getMessage());
            }
            assertFalse(text.toString().contains(SENTINEL), text.toString());
            classLogged |= text.toString().contains(expectedClassName);
        }
        assertTrue(classLogged, "expected the exception class in a captured log line");
    }

    @Test
    void invalidDataAnswersWithFixedBodyAndLogsClassOnly() throws Exception {
        AuditService auditService = mock(AuditService.class);
        ValidationExceptionHandlers handlers = new ValidationExceptionHandlers(auditService);
        HandlerMethod handlerMethod = new HandlerMethod(new AuditedTarget(), auditedMethod());

        ValidationExceptionHandlers.ErrorResponse response =
                handlers.handleBadRequestException(new InvalidDataException(SENTINEL), handlerMethod);

        assertEquals(ValidationExceptionHandlers.INVALID_DATA_MESSAGE, response.message());
        assertEquals(Map.of(), response.errors());
        String json = objectMapper.writeValueAsString(response);
        assertFalse(json.contains(SENTINEL), json);
        assertLogsCarryNoSentinel(InvalidDataException.class.getName());

        ArgumentCaptor<Event> captor = ArgumentCaptor.forClass(Event.class);
        verify(auditService).addAuditPropertiesToMDC(captor.capture());
        assertEquals(InvalidDataException.class.getName(), captor.getValue().getEventErrorMessage());
    }

    @Test
    void invalidDataWithoutHandlerMethodAnswersWithFixedBody() throws Exception {
        ValidationExceptionHandlers handlers = new ValidationExceptionHandlers(mock(AuditService.class));

        ValidationExceptionHandlers.ErrorResponse response =
                handlers.handleBadRequestException(new InvalidDataException(SENTINEL), null);

        assertEquals(ValidationExceptionHandlers.INVALID_DATA_MESSAGE, response.message());
        assertFalse(objectMapper.writeValueAsString(response).contains(SENTINEL));
        assertLogsCarryNoSentinel(InvalidDataException.class.getName());
    }

    @Test
    void auditDetailRecordsExceptionClassOnly() throws Exception {
        AuditService auditService = mock(AuditService.class);
        AuditEventContextHolder holder = new AuditEventContextHolder();
        AopConfiguration aop = new AopConfiguration(auditService, holder);
        MethodSignature signature = mock(MethodSignature.class);
        when(signature.getMethod()).thenReturn(auditedMethod());
        JoinPoint joinPoint = mock(JoinPoint.class);
        when(joinPoint.getSignature()).thenReturn(signature);

        aop.logAfterAuditableMethodException(joinPoint, new IllegalStateException(SENTINEL));

        Map<String, Object> properties = holder.getEventContextProperties();
        assertFalse(properties.isEmpty(), "expected an audit detail entry");
        assertFalse(properties.toString().contains(SENTINEL), properties.toString());
        assertEquals(
                Map.of(AuditLogElement.DetailElement.MESSAGE.toString(), IllegalStateException.class.getName()),
                properties.get(AuditLogElement.DETAIL.toString()));

        ArgumentCaptor<Event> captor = ArgumentCaptor.forClass(Event.class);
        verify(auditService).addAuditPropertiesToMDC(captor.capture());
        assertEquals(IllegalStateException.class.getName(), captor.getValue().getEventErrorMessage());
    }

    /** Binds {@code server.*} from the shipped application.yaml the way Spring Boot does at startup. */
    static ServerProperties shippedServerProperties() throws Exception {
        List<PropertySource<?>> sources =
                new YamlPropertySourceLoader().load("application.yaml", new ClassPathResource("application.yaml"));
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
        sources.forEach(source -> environment.getPropertySources().addLast(source));
        return new Binder(
                        ConfigurationPropertySources.get(environment),
                        new PropertySourcesPlaceholdersResolver(environment))
                .bind("server", ServerProperties.class)
                .orElseGet(ServerProperties::new);
    }

    @Test
    void defaultErrorResponseOmitsExceptionText() throws Exception {
        ErrorProperties errorProperties = shippedServerProperties().getError();
        assertEquals(ErrorProperties.IncludeAttribute.NEVER, errorProperties.getIncludeMessage());

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/df/file/api/v1/example");
        request.setAttribute(RequestDispatcher.ERROR_STATUS_CODE, 500);
        request.setAttribute(RequestDispatcher.ERROR_REQUEST_URI, "/df/file/api/v1/example");
        request.setAttribute(RequestDispatcher.ERROR_MESSAGE, SENTINEL);
        request.setAttribute(RequestDispatcher.ERROR_EXCEPTION, new IllegalStateException(SENTINEL));

        ResponseEntity<Map<String, Object>> response =
                new BasicErrorController(new DefaultErrorAttributes(), errorProperties).error(request);

        assertNotNull(response.getBody());
        assertFalse(response.getBody().isEmpty(), "expected a default error body");
        String json = objectMapper.writeValueAsString(response.getBody());
        assertFalse(json.contains(SENTINEL), json);
        assertFalse(response.getBody().containsKey("message"), json);
        assertFalse(response.getBody().containsKey("trace"), json);
    }

    @Test
    void includeMessageAlwaysWouldEchoExceptionText() {
        ErrorProperties errorProperties = new ErrorProperties();
        errorProperties.setIncludeMessage(ErrorProperties.IncludeAttribute.ALWAYS);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/df/file/api/v1/example");
        request.setAttribute(RequestDispatcher.ERROR_STATUS_CODE, 500);
        request.setAttribute(RequestDispatcher.ERROR_MESSAGE, SENTINEL);
        request.setAttribute(RequestDispatcher.ERROR_EXCEPTION, new IllegalStateException(SENTINEL));

        ResponseEntity<Map<String, Object>> response =
                new BasicErrorController(new DefaultErrorAttributes(), errorProperties).error(request);

        // Control for the check above: the setting this change removes would put the text in the body.
        assertNotNull(response.getBody());
        assertEquals(SENTINEL, response.getBody().get("message"));
    }
}
