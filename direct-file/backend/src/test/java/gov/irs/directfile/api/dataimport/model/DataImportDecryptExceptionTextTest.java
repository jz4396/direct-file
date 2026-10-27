package gov.irs.directfile.api.dataimport.model;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.core.JsonParseException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import gov.irs.directfile.models.encryption.DataEncryptDecrypt;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Stored import data that fails to decrypt or parse is logged with the exception class only. Jackson quotes the source
 * it could not parse, and a decrypt error can carry key or ciphertext detail, so each test plants a sentinel and
 * asserts it is absent from a non-empty log capture, including throwable proxies, and that the exception class is
 * present.
 */
class DataImportDecryptExceptionTextTest {
    // One JSON token. Jackson quotes that token in JsonParseException; a hyphen ends the token and drops the rest.
    static final String SENTINEL = "exceptiontextsentinel8243";

    final Logger listenerLogger = (Logger) LoggerFactory.getLogger(PopulatedDataEntityListener.class);
    final Logger decryptorLogger = (Logger) LoggerFactory.getLogger(RawResponseDecryptor.class);
    final ListAppender<ILoggingEvent> logAppender = new ListAppender<>();

    final ObjectMapper objectMapper = new ObjectMapper();
    DataEncryptDecrypt dataEncryptDecrypt;
    PopulatedDataEntityListener listener;
    RawResponseDecryptor decryptor;

    @BeforeEach
    void setUp() {
        logAppender.start();
        listenerLogger.addAppender(logAppender);
        decryptorLogger.addAppender(logAppender);
        dataEncryptDecrypt = mock(DataEncryptDecrypt.class);
        listener = new PopulatedDataEntityListener();
        listener.configure(dataEncryptDecrypt, objectMapper);
        decryptor = new RawResponseDecryptor(dataEncryptDecrypt, objectMapper);
    }

    @AfterEach
    void tearDown() {
        listenerLogger.detachAppender(logAppender);
        decryptorLogger.detachAppender(logAppender);
        logAppender.stop();
    }

    PopulatedData ciphertext() {
        PopulatedData populatedData = new PopulatedData();
        String cipher = Base64.getEncoder().encodeToString("cipher".getBytes(StandardCharsets.UTF_8));
        populatedData.setDataCipherText(cipher);
        populatedData.setRawDataCipherText(cipher);
        return populatedData;
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
    void populatedDataDecryptFailureLogsClassOnly() {
        IllegalStateException failure = new IllegalStateException(SENTINEL, new IllegalArgumentException(SENTINEL));
        assertTrue(failure.getMessage().contains(SENTINEL), "control: the exception message carries the sentinel");
        assertTrue(
                failure.getCause().getMessage().contains(SENTINEL), "control: the cause message carries the sentinel");
        when(dataEncryptDecrypt.decrypt(any())).thenThrow(failure);

        PopulatedData populatedData = ciphertext();
        listener.decryptColumn(populatedData);

        assertLogsCarryNoSentinel(IllegalStateException.class.getName());
        assertNull(populatedData.getData());
    }

    @Test
    void populatedDataParseFailureLogsClassOnly() throws Exception {
        JsonProcessingException parseFailure =
                assertThrows(JsonParseException.class, () -> objectMapper.readTree(SENTINEL));
        assertTrue(parseFailure.getMessage().contains(SENTINEL), "control: the parse error quotes the sentinel");
        when(dataEncryptDecrypt.decrypt(any())).thenReturn(SENTINEL.getBytes(StandardCharsets.UTF_8));

        listener.decryptColumn(ciphertext());

        assertLogsCarryNoSentinel(JsonParseException.class.getName());
    }

    @Test
    void rawResponseDecryptFailureLogsClassOnly() {
        IllegalStateException failure = new IllegalStateException(SENTINEL, new IllegalArgumentException(SENTINEL));
        assertTrue(failure.getMessage().contains(SENTINEL), "control: the exception message carries the sentinel");
        assertTrue(
                failure.getCause().getMessage().contains(SENTINEL), "control: the cause message carries the sentinel");
        when(dataEncryptDecrypt.decrypt(any())).thenThrow(failure);

        assertNull(decryptor.decryptRawResponse(ciphertext()));

        assertLogsCarryNoSentinel(IllegalStateException.class.getName());
    }

    @Test
    void rawResponseParseFailureLogsClassOnly() throws Exception {
        JsonProcessingException parseFailure =
                assertThrows(JsonParseException.class, () -> objectMapper.readTree(SENTINEL));
        assertTrue(parseFailure.getMessage().contains(SENTINEL), "control: the parse error quotes the sentinel");
        when(dataEncryptDecrypt.decrypt(any())).thenReturn(SENTINEL.getBytes(StandardCharsets.UTF_8));

        assertNull(decryptor.decryptRawResponse(ciphertext()));

        assertLogsCarryNoSentinel(JsonParseException.class.getName());
    }
}
