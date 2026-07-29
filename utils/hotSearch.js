import { debounceTime, distinctUntilChanged, map, scan, Subscription } from 'rxjs';

export function createHotSearch(input$, run, wait = 500) {
  const subscription = new Subscription();
  subscription.add(
    input$
      .pipe(
        map((value) => String(value == null ? '' : value).trim()),
        scan(
          (state, keyword) => ({
            keyword,
            revision: state.keyword === keyword ? state.revision : state.revision + 1,
          }),
          { keyword: undefined, revision: 0 },
        ),
        debounceTime(wait),
        distinctUntilChanged(
          (previous, current) =>
            previous.keyword === current.keyword && previous.revision === current.revision,
        ),
        map(({ keyword }) => keyword),
      )
      .subscribe((keyword) => run(keyword)),
  );

  return () => subscription.unsubscribe();
}
