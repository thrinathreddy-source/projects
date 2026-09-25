import type { ResourceScraperSource } from '../types'
import { fetchGithubAwesomeLists } from './github'
import { fetchRedditResources } from './reddit'

export const RESOURCE_SOURCES: ResourceScraperSource[] = [
  { name: 'GitHub (awesome-lists)', fetch: fetchGithubAwesomeLists },
  { name: 'Reddit (curated subs)', fetch: fetchRedditResources },
]
