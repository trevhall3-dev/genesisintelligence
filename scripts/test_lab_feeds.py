import unittest
from unittest.mock import patch
from types import SimpleNamespace
import requests
import collect_genesis_news as c
S={'name':'Lab','group':'Labs','host':'example.gov','url':'https://example.gov/news','feed':'https://example.gov/feed','cap':15}
class Feeds(unittest.TestCase):
 def response(self,body):return SimpleNamespace(content=body.encode(),url=S['feed'],raise_for_status=lambda:None)
 def test_rss_filters_external_and_verifies_article(self):
  xml='<rss><channel><item><title>Genesis Mission update</title><link>https://example.gov/news/story</link><description>Genesis Mission research</description><pubDate>Mon, 09 Nov 2026 10:00:00 GMT</pubDate></item><item><title>Genesis Mission external</title><link>https://other.gov/story</link></item></channel></rss>'
  with patch.object(c.requests,'get',return_value=self.response(xml)),patch.object(c,'article_body',return_value=('Genesis Mission research progresses','')) as article:
   items=c.feed_links(S,[]);self.assertEqual(len(items),1);self.assertEqual(items[0]['date'],'2026-11-09');self.assertEqual(article.call_count,1)
 def test_atom(self):
  xml='<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Genesis Mission update</title><link href="https://example.gov/news/story"/><summary>Genesis Mission research</summary><published>2026-11-09T10:00:00Z</published></entry></feed>'
  with patch.object(c.requests,'get',return_value=self.response(xml)),patch.object(c,'article_body',return_value=('Genesis Mission research','')):
   self.assertEqual(c.feed_links(S,[])[0]['date'],'2026-11-09')
 def test_html_masquerading_as_feed_falls_back(self):
  with patch.object(c.requests,'get',return_value=self.response('<html/>')),patch.object(c,'index_links',return_value=[]) as index:
   result=c.source_items(S,[],'labs');self.assertEqual(result[2],'html');self.assertIn('not an RSS',result[3]);index.assert_called_once()
 def test_blocked_articles_not_successful_zero(self):
  xml='<rss><channel><item><title>Genesis Mission update</title><link>https://example.gov/news/story</link></item></channel></rss>'
  with patch.object(c.requests,'get',return_value=self.response(xml)),patch.object(c,'article_body',side_effect=requests.HTTPError('403')):
   with self.assertRaisesRegex(ValueError,'all candidate'):c.feed_links(S,[])
 def test_reviewed_record_survives_refresh(self):
  import tempfile,json
  from pathlib import Path
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'archive.json'
   old={'url':'https://example.gov/news/story','title':'Reviewed title','summary':'Reviewed summary','classification':'Confirmed Genesis','project_ids':['a']}
   path.write_text(json.dumps({'items':[old]}))
   with patch.object(c,'ARCHIVE',path):c.merge('labs',[{**old,'title':'Raw title','summary':'Raw text','classification':'','project_ids':['b']}],[])
   result=json.loads(path.read_text())['items'][0]
   self.assertEqual(result['title'],'Reviewed title');self.assertEqual(result['classification'],'Confirmed Genesis');self.assertEqual(result['project_ids'],['a','b'])
unittest.main()
