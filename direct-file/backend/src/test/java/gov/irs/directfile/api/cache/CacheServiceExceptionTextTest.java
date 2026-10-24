package gov.irs.directfile.api.cache;

import java.util.function.Consumer;
import java.util.stream.Stream;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * A Redis failure is logged with the exception class only: neither the exception message nor its cause's message
 * reaches the log. Each case plants a sentinel in both and asserts it is absent from a non-empty capture.
 */
class CacheServiceExceptionTextTest {
    static final String SENTINEL = "exception-text-sentinel-7352";

    final Logger cacheLogger = (Logger) LoggerFactory.getLogger(CacheService.class);
    final ListAppender<ILoggingEvent> logAppender = new ListAppender<>();

    @SuppressWarnings("unchecked")
    final RedisTemplate<String, String> redisTemplate = mock(RedisTemplate.class);

    final CacheService cacheService = new CacheService(redisTemplate, new ObjectMapper());

    @BeforeEach
    void setUp() {
        logAppender.start();
        cacheLogger.addAppender(logAppender);
        IllegalStateException failure = new IllegalStateException(SENTINEL, new IllegalArgumentException(SENTINEL));
        when(redisTemplate.opsForValue()).thenThrow(failure);
        when(redisTemplate.delete(anyString())).thenThrow(failure);
        when(redisTemplate.keys(anyString())).thenThrow(failure);
    }

    @AfterEach
    void tearDown() {
        cacheLogger.detachAppender(logAppender);
        logAppender.stop();
    }

    static Stream<Arguments> operations() {
        return Stream.of(
                Arguments.of("set", (Consumer<CacheService>) c -> c.set("cacheName", "key1", "value1")),
                Arguments.of("get", (Consumer<CacheService>) c -> c.get("cacheName", "key1", String.class)),
                Arguments.of("clearKey", (Consumer<CacheService>) c -> c.clearKey("cacheName", "key1")),
                Arguments.of("clearCache", (Consumer<CacheService>) c -> c.clearCache("cacheName")));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("operations")
    void redisFailureLogsClassOnly(String name, Consumer<CacheService> operation) {
        operation.accept(cacheService);

        boolean errorLogged = false;
        for (ILoggingEvent event : logAppender.list) {
            StringBuilder text = new StringBuilder(event.getFormattedMessage());
            for (IThrowableProxy proxy = event.getThrowableProxy(); proxy != null; proxy = proxy.getCause()) {
                text.append(' ').append(proxy.getMessage());
            }
            assertFalse(text.toString().contains(SENTINEL), text.toString());
            errorLogged |= text.toString().contains(IllegalStateException.class.getName());
        }
        assertTrue(errorLogged, "expected the exception class in a captured log line");
    }
}
