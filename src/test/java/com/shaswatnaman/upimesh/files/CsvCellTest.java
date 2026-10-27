package com.shaswatnaman.upimesh.files;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CsvCellTest {

    @Test
    void plainValueIsUnchanged() {
        assertEquals("alice@demo", LedgerFileService.cell("alice@demo"));
    }

    @Test
    void nullBecomesEmpty() {
        assertEquals("", LedgerFileService.cell(null));
    }

    @Test
    void commasAndQuotesAreQuotedPerRfc4180() {
        assertEquals("\"a,b\"", LedgerFileService.cell("a,b"));
        assertEquals("\"say \"\"hi\"\"\"", LedgerFileService.cell("say \"hi\""));
    }

    @Test
    void formulaPrefixIsNeutralised() {
        assertEquals("'=SUM(A1)", LedgerFileService.cell("=SUM(A1)"));
        assertEquals("'@cmd", LedgerFileService.cell("@cmd"));
    }
}
