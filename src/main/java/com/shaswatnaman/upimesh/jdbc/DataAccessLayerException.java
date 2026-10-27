package com.shaswatnaman.upimesh.jdbc;

/** Unchecked wrapper so callers are not forced to handle java.sql.SQLException. */
public class DataAccessLayerException extends RuntimeException {
    public DataAccessLayerException(String message, Throwable cause) {
        super(message, cause);
    }
}
