'use client'

import { motion } from 'framer-motion'

/**
 * The framer-motion wrapper for cards that genuinely animate.
 *
 * It lives in its own module so that importing a card does not import
 * framer-motion. The cards used to wrap themselves, which meant the
 * homepage — where no card ever animates, because the list is fixed for
 * the lifetime of the page — still paid for the whole animation library in
 * its client bundle. /browse is the one surface where filtering really
 * adds, removes and reorders cards inside an AnimatePresence, and it
 * imports framer-motion for its own grid anyway.
 *
 * `layout` is what lets AnimatePresence's popLayout mode slide the
 * surviving cards into the gap a filtered-out card leaves behind.
 */
export function AnimatedCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  )
}
