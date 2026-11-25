import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from refresh import records, coordinates, validate, refresh

SAMPLE = b'''<FederalContaminatedSitesInventory><ReportingOrganizations><ReportingOrganization><Code>TEST</Code><EN>Custodian</EN></ReportingOrganization></ReportingOrganizations><Sites><Site FederalSiteIdentifier="000001" ReportingOrganization="TEST" LastModified="2026-10-31T00:00:00"><Name><EN>Test site</EN></Name><SiteStatus><Status><EN>Active</EN></Status></SiteStatus><Location><Province>British Columbia</Province><Latitude>49.1</Latitude><Longitude>-123.0</Longitude></Location><ContaminationDetails><ContaminatedMedia><Contamination><EN>Lead</EN></Contamination><Medium><EN>Soil</EN></Medium></ContaminatedMedia></ContaminationDetails><AnnualData FiscalYear="2024-2025"><HighestStepCompleted>09</HighestStepCompleted></AnnualData><AnnualData FiscalYear="2025-2026"><HighestStepCompleted>08</HighestStepCompleted></AnnualData><AnnualData FiscalYear="2025-2026"><HighestStepCompleted>07</HighestStepCompleted></AnnualData></Site></Sites></FederalContaminatedSitesInventory>'''

class SourceTests(unittest.TestCase):
    def test_preserves_latest_year_conflicts_contamination_pairs_and_custodian(self):
        row = list(records(io.BytesIO(SAMPLE)))[0]
        self.assertEqual(row['steps'], ['07', '08'])
        self.assertEqual(row['fiscal_year'], '2025-2026')
        self.assertEqual(row['custodian'], 'Custodian')
        self.assertEqual(row['contamination_media'], [('Lead', 'Soil')])
        self.assertEqual(row['geo'], [49.1, -123.0])
    def test_missing_invalid_and_zero_coordinates_are_unmapped(self):
        for pair in [('', ''), ('nan', '10'), ('0', '0'), ('91', '-123'), ('49', '-181')]:
            self.assertIsNone(coordinates(*pair))
        self.assertEqual(coordinates('0', '10'), [0.0, 10.0])
    def test_validation_detects_truncation_duplicate_and_missing_coverage(self):
        row = list(records(io.BytesIO(SAMPLE)))[0]
        config = {'minimum_records': 1, 'minimum_provinces': 1, 'minimum_previous_fraction': .8}
        validate([row], config)
        with self.assertRaisesRegex(ValueError, 'Duplicate'): validate([row, row], config)
        with self.assertRaisesRegex(ValueError, 'decline'): validate([row], config, previous_count=10)
        with self.assertRaisesRegex(ValueError, 'coverage'): validate([row], {**config, 'minimum_provinces': 2})
    def test_failed_http_download_preserves_cache_and_check_date(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root/'config').mkdir(); (root/'data').mkdir()
            (root/'config/source.json').write_text(json.dumps({'download_url':'https://example.com/source.zip','timeout_seconds':1,'maximum_download_bytes':1000}))
            old = b'{"checked_at":"2026-01-01T00:00:00Z"}'
            (root/'data/status.json').write_bytes(old)
            with patch('refresh.urllib.request.urlopen', side_effect=HTTPError('url', 403, 'Forbidden', {}, None)):
                with self.assertRaises(HTTPError): refresh(root)
            self.assertEqual((root/'data/status.json').read_bytes(), old)

if __name__ == '__main__': unittest.main()
