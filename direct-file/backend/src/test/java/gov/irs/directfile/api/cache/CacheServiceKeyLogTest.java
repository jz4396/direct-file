package gov.irs.directfile.api.cache;

import java.time.Duration;
import java.util.function.Consumer;
import java.util.stream.Stream;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Cache operations log the cache name at INFO. The key, which for the users cache is an external id, stays off INFO
 * lines. Each case uses a sentinel key and asserts no INFO line contains it.
 */
class CacheServiceKeyLogTest {
    static final String CACHE_NAME = "users";
    static final String SENTINEL_KEY = "external-id-sentinel-8243";

    final Logger cacheLogger = (Logger) LoggerFactory.getLogger(CacheService.class);
    final ListAppender<ILoggingEvent> logAppender = new ListAppender<>();
    Level previousLevel;

    @SuppressWarnings("unchecked")
    final RedisTemplate<String, String> redisTemplate = mock(RedisTemplate.class);

    @SuppressWarnings("unchecked")
    final ValueOperations<String, String> valueOperations = mock(ValueOperations.class);

    final CacheService cacheService = new CacheService(redisTemplate, new ObjectMapper());

    @BeforeEach
    void setUp() {
        previousLevel = cacheLogger.getLevel();
        cacheLogger.setLevel(Level.DEBUG);
        logAppender.start();
        cacheLogger.addAppender(logAppender);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @AfterEach
    void tearDown() {
        cacheLogger.detachAppender(logAppender);
        cacheLogger.setLevel(previousLevel);
        logAppender.stop();
    }

    static Stream<Arguments> operations() {
        return Stream.of(
                Arguments.of("set", (Consumer<CacheService>) c -> c.set(CACHE_NAME, SENTINEL_KEY, "value")),
                Arguments.of("setWithTimeout", (Consumer<CacheService>)
                        c -> c.set(CACHE_NAME, SENTINEL_KEY, "value", Duration.ofMinutes(5))),
                Arguments.of("get", (Consumer<CacheService>) c -> c.get(CACHE_NAME, SENTINEL_KEY, String.class)),
                Arguments.of("clearKey", (Consumer<CacheService>) c -> c.clearKey(CACHE_NAME, SENTINEL_KEY)),
                Arguments.of("clearCache", (Consumer<CacheService>) c -> c.clearCache(CACHE_NAME)));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("operations")
    void infoLogsOmitKey(String name, Consumer<CacheService> operation) {
        operation.accept(cacheService);

        boolean infoLogged = false;
        String pattern = CACHE_NAME + CacheService.KEY_SEPARATOR + CacheService.KEY_GLOB;
        for (ILoggingEvent event : logAppender.list) {
            if (event.getLevel() != Level.INFO) {
                continue;
            }
            infoLogged = true;
            String message = event.getFormattedMessage();
            assertTrue(message.contains(CACHE_NAME), message);
            assertFalse(message.contains(SENTINEL_KEY), message);
            assertFalse(message.contains(pattern), message);
        }
        assertTrue(infoLogged, "expected an INFO log line");
        assertFalse(logAppender.list.isEmpty(), "expected at least one captured log line");
    }
}
