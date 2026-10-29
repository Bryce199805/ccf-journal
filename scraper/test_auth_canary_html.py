import unittest

from auth_canary_html import extract_signals


class AuthCanaryHtmlTests(unittest.TestCase):
    def test_login_gate_does_not_take_following_cas_zone_as_wos_value(self):
        signals = extract_signals(
            '<form><table><tr><td>WOS分区等级</td><td>注册或登录后查看WOS分区等级</td></tr>'
            '<tr><td>中科院分区</td><td>1区</td></tr></table></form>'
        )
        self.assertTrue(signals['loginGateVisible'])
        self.assertEqual(signals['wosZone'], '')
        self.assertFalse(signals['wosAvailable'])

    def test_new_jcr_heading_with_zone_is_wos_value(self):
        signals = extract_signals('<table><tr><td>WOS期刊JCR分区</td><td>2区</td></tr></table>')
        self.assertTrue(signals['wosSectionPresent'])
        self.assertTrue(signals['wosAvailable'])
        self.assertEqual(signals['wosZone'], '2区')

    def test_wos_heading_with_subject_quartile_is_available_without_invented_zone(self):
        signals = extract_signals('<table><tr><td>WOS期刊JCR分区</td><td>JIF学科分区 Q1</td></tr></table>')
        self.assertTrue(signals['wosAvailable'])
        self.assertEqual(signals['wosZone'], '')

    def test_unknown_heading_does_not_accept_cas_zone_after_boundary(self):
        signals = extract_signals('<div>WOS期刊JCR分区</div><div>中科院升级版分区1区</div>')
        self.assertFalse(signals['wosAvailable'])
        self.assertEqual(signals['wosZone'], '')


if __name__ == '__main__':
    unittest.main()
